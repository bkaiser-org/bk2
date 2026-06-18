# i18n Store Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Centralise all i18n string resolution in NgRx Signal Stores so no feature component ever imports `I18nService`, `TranslatePipe`, `AsyncPipe` (for translations), or `PFX`; instead, components read translated strings via `computed(() => this.store.i18n.key())`.

**Architecture:**  
Every store gains a typed `i18n` property created by `store.i18nService.translateAll({key: PFX + 'key', ...})` inside a second `withProps` block. Feature components drop `I18nService`/`PFX` imports and read `this.store.i18n.key()`. Shared/UI components that previously accepted translation keys and ran `| translate | async` are changed to accept pre-translated strings (callers' responsibility). UI-layer form components receive an `i18n = input<...>()` object from the parent feature component. Components with no existing store get a minimal store added.

**Tech Stack:** Angular 20, NgRx Signal Stores (`@ngrx/signals`), `I18nService.translateAll`, Ionic Angular, pnpm/Nx.

---

## Target Pattern — Reference Implementation

### Store pattern (authoritative example: `libs/activity/feature/src/lib/activity.store.ts`)

```ts
// First withProps: inject services
withProps(() => ({
  activityService: inject(ActivityService),
  appStore: inject(AppStore),
  modalController: inject(ModalController),
  i18nService: inject(I18nService),          // ← I18nService here, not in component
})),
// Second withProps: derive i18n from service
withProps((store) => ({
  i18n: store.i18nService.translateAll({
    title:     PFX + 'title',
    empty:     PFX + 'empty',
    // ...add every UI string the component needs
  }),
  // ...other derived props
})),
```

### Component pattern (authoritative example: `libs/activity/feature/src/lib/activity-list.ts`)

```ts
// NO imports of I18nService, PFX, TranslatePipe, AsyncPipe
protected readonly store = inject(ActivityStore);
protected title = computed(() => this.store.i18n.title());   // ← reads from store
protected empty = computed(() => this.store.i18n.empty());
```

Template: `{{ title() }}` — never `{{ '@key' | translate | async }}`.

### Shared UI component pattern (no store)

Remove the pipe entirely; display whatever string the caller passes:

```ts
// Before
{{ label() | translate | async }}

// After
{{ label() }}
```

The component's `label = input<string>()` stays — the **caller** now passes a translated string.

### UI-layer form component pattern

Form components receive a single typed `i18n` input:

```ts
// In the form (e.g. task.form.ts)
export type TaskFormI18n = {
  state_label: string;
  priority_label: string;
  importance_label: string;
  // ...one entry per translated string used in the template
};
public readonly i18n = input<TaskFormI18n>({ state_label: '', priority_label: '', importance_label: '' });

// In template:
<ion-label>{{ i18n.state_label() }}</ion-label>
```

```ts
// In the parent feature component (e.g. task-list.ts)
// Store's i18n covers both own strings AND the form's strings:
//   i18n: store.i18nService.translateAll({
//     ...taskOwnStrings,
//     state_label: '@input.state.label',
//     priority_label: '@input.priority.label',
//   })
protected readonly formI18n = computed<TaskFormI18n>(() => ({
  state_label: this.store.i18n.state_label(),
  priority_label: this.store.i18n.priority_label(),
  importance_label: this.store.i18n.importance_label(),
}));

// Template:
<bk-task-form [i18n]="formI18n()" ... />
```

### Minimal store for previously storeless components

```ts
// auth.store.ts
import { inject } from '@angular/core';
import { signalStore, withProps } from '@ngrx/signals';
import { I18nService } from '@bk2/shared-i18n';
import { PFX } from './scope';

export const AuthStore = signalStore(
  withProps(() => ({ i18nService: inject(I18nService) })),
  withProps((store) => ({
    i18n: store.i18nService.translateAll({
      login_title:   PFX + 'login.title',
      // ...all strings from the component
    }),
  })),
);
```

Component adds `providers: [AuthStore]` and `protected readonly store = inject(AuthStore)`.

---

## File Map

### Modified (store only — add `i18n` block)
Most stores under `libs/*/feature/` that already inject or can inject `I18nService`.

### Modified (component — remove I18nService/PFX/Pipe, use store.i18n)
All feature components currently importing `I18nService`, `PFX`, `TranslatePipe`, or `AsyncPipe` (for translations).

### Modified (shared/ui — remove pipe, display string directly)
~30 components under `libs/shared/ui/`, plus `libs/avatar/ui/`, `libs/chat/ui/`, `libs/calevent/ui/`, `libs/comment/ui/`, etc.

### Modified (ui forms — add i18n input, parent passes typed object)
`libs/task/ui/task.form.ts`, `libs/user/ui/*.form.ts`, `libs/subject/*/ui/*.form.ts`, `libs/relationship/*/ui/*.form.ts`, `libs/cms/menu/ui/menu.form.ts`, `libs/cms/section/ui/*.ts`, `libs/profile/ui/*.form.ts`, etc.

### Created (new stores)
- `libs/auth/feature/src/lib/auth.store.ts`

### Modified (documentation)
- `CLAUDE.md` — update i18n architecture section

---

## Task 1: Migrate `shared/ui` components — remove TranslatePipe

**Files to modify** (remove `TranslatePipe`, `AsyncPipe`; change `{{ x() | translate | async }}` → `{{ x() }}`):

- `libs/shared/ui/src/lib/empty-list.ts`
- `libs/shared/ui/src/lib/list-filter.ts`
- `libs/shared/ui/src/lib/meta-tag-list.ts`
- `libs/shared/ui/src/lib/notes-input.ts`
- `libs/shared/ui/src/lib/number-input.ts`
- `libs/shared/ui/src/lib/optional-card-header.ts`
- `libs/shared/ui/src/lib/password-input.ts`
- `libs/shared/ui/src/lib/phone-input.ts`
- `libs/shared/ui/src/lib/property-list.ts`
- `libs/shared/ui/src/lib/section-header.ts`
- `libs/shared/ui/src/lib/single-tag.ts`
- `libs/shared/ui/src/lib/string-list.ts`
- `libs/shared/ui/src/lib/string-select.ts`
- `libs/shared/ui/src/lib/text-input.ts`
- `libs/shared/ui/src/lib/text-list.ts`
- `libs/shared/ui/src/lib/time-input.ts`
- `libs/shared/ui/src/lib/time-select.modal.ts`
- `libs/shared/ui/src/lib/url-input.ts`
- `libs/shared/ui/src/lib/viewdate-input.ts`
- `libs/shared/ui/src/lib/year-select.ts`
- `libs/shared/ui/src/lib/label-select.modal.ts`
- `libs/shared/ui/src/lib/button-copy.ts`
- `libs/shared/ui/src/lib/card-select.modal.ts`
- `libs/shared/ui/src/lib/category-items.ts`
- `libs/shared/ui/src/lib/category-select.modal.ts`
- `libs/shared/ui/src/lib/category-select.ts`
- `libs/shared/ui/src/lib/change-confirmation.ts`
- `libs/shared/ui/src/lib/checkbox.ts`
- `libs/shared/ui/src/lib/chip-select.modal.ts`
- `libs/shared/ui/src/lib/chips.ts`
- `libs/shared/ui/src/lib/color-select.modal.ts`
- `libs/shared/ui/src/lib/color.ts`
- `libs/shared/ui/src/lib/connection-status-button.ts`
- `libs/shared/ui/src/lib/date-input.ts`
- `libs/shared/ui/src/lib/date-picker.modal.ts`
- `libs/shared/ui/src/lib/date-select.modal.ts`
- `libs/shared/ui/src/lib/date-time-select.modal.ts`
- `libs/shared/ui/src/lib/editor.ts`
- `libs/shared/ui/src/lib/email-addresses.modal.ts`
- `libs/shared/ui/src/lib/email-input.ts`
- `libs/shared/ui/src/lib/error-toolbar.ts`
- `libs/shared/ui/src/lib/header.ts`
- `libs/shared/ui/src/lib/iban-input.ts`
- `libs/shared/ui/src/lib/image-config.ts`
- `libs/shared/ui/src/lib/image-url-input.ts`

- [ ] **Step 1: Read each file and identify every `| translate | async` occurrence**

  Run: `grep -n "translate\|AsyncPipe\|TranslatePipe" libs/shared/ui/src/lib/*.ts`

- [ ] **Step 2: For each file — remove `TranslatePipe` and `AsyncPipe` from imports array and `import` statement; replace `{{ x | translate | async }}` with `{{ x }}` and `{{ x() | translate | async }}` with `{{ x() }}`**

  Pattern: every `[someInput]="'@some.key' | translate | async"` becomes `[someInput]="'@some.key'"` only if the caller is already responsible. If the input was a hardcoded key in the template, it should stay as a string literal for now — callers will be updated in later tasks when their parent feature stores are migrated.

  NOTE: Some usages pipe a hardcoded string literal like `'@some.key' | translate | async` — these become string literals passed through until the parent migrates.

- [ ] **Step 3: Type-check shared-ui**

  Run: `npx tsc --noEmit -p libs/shared/ui/tsconfig.json`  
  Fix any errors before continuing.

- [ ] **Step 4: Commit**

  ```bash
  git add libs/shared/ui/
  git commit -m "refactor(shared-ui): remove TranslatePipe/AsyncPipe — accept pre-translated strings"
  ```

---

## Task 2: Migrate `avatar/ui`, `calevent/ui`, `comment/ui` shared UI components

Same operation as Task 1 for:

- `libs/avatar/ui/src/lib/avatar-input.ts`
- `libs/avatar/ui/src/lib/avatars.ts`
- `libs/avatar/ui/src/lib/relationship-toolbar.ts`
- `libs/calevent/ui/src/lib/regression-selection.modal.ts`
- `libs/comment/ui/src/lib/comment-header.ts`
- `libs/comment/ui/src/lib/comment-input.ts`
- `libs/comment/ui/src/lib/comments-list.ts`

- [ ] **Step 1: Remove TranslatePipe/AsyncPipe; replace `| translate | async` with direct display**
- [ ] **Step 2: Type-check affected libs**

  ```bash
  npx tsc --noEmit -p libs/avatar/ui/tsconfig.json
  npx tsc --noEmit -p libs/calevent/ui/tsconfig.json
  npx tsc --noEmit -p libs/comment/ui/tsconfig.json
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add libs/avatar/ui/ libs/calevent/ui/ libs/comment/ui/
  git commit -m "refactor(ui): remove TranslatePipe from avatar/calevent/comment ui components"
  ```

---

## Task 3: Migrate `chat/ui` shared UI components

- `libs/chat/ui/src/lib/matrix-message-input.ts`
- `libs/chat/ui/src/lib/matrix-message-list.ts`
- `libs/chat/ui/src/lib/matrix-room-list.ts`
- `libs/chat/ui/src/lib/poll-create.form.ts`
- `libs/chat/ui/src/lib/poll-detail.modal.ts`
- `libs/chat/ui/src/lib/poll-message.ts`

- [ ] **Step 1: Remove TranslatePipe/AsyncPipe; replace `| translate | async` with direct display**
- [ ] **Step 2: Identify any hardcoded key strings; these will need to be passed in as `input()` from `matrix-chat.store` or remain as-is until chat is migrated in Task 10**
- [ ] **Step 3: Type-check**

  `npx tsc --noEmit -p libs/chat/ui/tsconfig.json`

- [ ] **Step 4: Commit**

  ```bash
  git add libs/chat/ui/
  git commit -m "refactor(chat-ui): remove TranslatePipe from chat UI components"
  ```

---

## Task 4: Migrate `cms/section/ui` and `cms/menu/ui` components

- `libs/cms/section/ui/src/lib/album-configuration.ts`
- `libs/cms/section/ui/src/lib/button-style-configuration.ts`
- `libs/cms/section/ui/src/lib/chat-configuration.ts`
- `libs/cms/section/ui/src/lib/editor-configuration.ts`
- `libs/cms/section/ui/src/lib/events-configuration.ts`
- `libs/cms/section/ui/src/lib/icon-configuration.ts`
- `libs/cms/section/ui/src/lib/iframe-configuration.ts`
- `libs/cms/section/ui/src/lib/image-edit.modal.ts`
- `libs/cms/section/ui/src/lib/image-style-configuration.ts`
- `libs/cms/section/ui/src/lib/images-configuration.ts`
- `libs/cms/section/ui/src/lib/invitations-configuration.ts`
- `libs/cms/section/ui/src/lib/map-configuration.ts`
- `libs/cms/section/ui/src/lib/people-configuration.ts`
- `libs/cms/section/ui/src/lib/persons-widget.ts`
- `libs/cms/section/ui/src/lib/responsibility-configuration.ts`
- `libs/cms/section/ui/src/lib/section-configuration.ts`
- `libs/cms/section/ui/src/lib/table-body.ts`
- `libs/cms/section/ui/src/lib/table-grid-configuration.ts`
- `libs/cms/section/ui/src/lib/table-header.ts`
- `libs/cms/section/ui/src/lib/table-style-configuration.ts`
- `libs/cms/section/ui/src/lib/tracker-configuration.ts`
- `libs/cms/section/ui/src/lib/video-configuration.ts`
- `libs/cms/menu/ui/src/lib/menu.form.ts`

- [ ] **Step 1: Remove TranslatePipe/AsyncPipe/I18nService/PFX; replace `| translate | async` with direct signal reads**

  For `menu.form.ts` specifically: add a typed `i18n = input<MenuFormI18n>({...})` (all keys defaulting to `''`). Replace all `| translate | async` uses with `i18n.<key>()`.

- [ ] **Step 2: Type-check**

  ```bash
  npx tsc --noEmit -p libs/cms/section/ui/tsconfig.json
  npx tsc --noEmit -p libs/cms/menu/ui/tsconfig.json
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add libs/cms/section/ui/ libs/cms/menu/ui/
  git commit -m "refactor(cms-ui): remove TranslatePipe from section and menu UI components"
  ```

---

## Task 5: Migrate `cms/page/ui` and remaining ui-layer forms

- `libs/cms/page/ui/src/lib/page.form.ts`
- `libs/profile/ui/src/lib/profile-data.form.ts`
- `libs/profile/ui/src/lib/profile-privacy.form.ts`
- `libs/profile/ui/src/lib/profile-settings.form.ts`
- `libs/relationship/membership/ui/src/lib/category-change.form.ts`
- `libs/relationship/membership/ui/src/lib/member-new.form.ts`
- `libs/relationship/membership/ui/src/lib/membership.form.ts`
- `libs/relationship/personal-rel/ui/src/lib/personal-rel.form.ts`
- `libs/relationship/reservation/ui/src/lib/reservation.form.ts`
- `libs/relationship/transfer/ui/src/lib/transfer.form.ts`
- `libs/relationship/workrel/ui/src/lib/workrel.form.ts`
- `libs/resource/ui/src/lib/resource.form.ts`
- `libs/subject/group/ui/src/lib/group.form.ts`
- `libs/subject/person/ui/src/lib/person-new.form.ts`
- `libs/task/ui/src/lib/task.form.ts`
- `libs/user/ui/src/lib/fbuser.form.ts`
- `libs/user/ui/src/lib/user-auth.form.ts`
- `libs/user/ui/src/lib/user-display.form.ts`
- `libs/user/ui/src/lib/user-model.form.ts`
- `libs/user/ui/src/lib/user-notification.form.ts`
- `libs/user/ui/src/lib/user-privacy.form.ts`

For each form component:

- [ ] **Step 1: Read the file and list all translation keys used in the template** (e.g. every `'@some.key' | translate | async` or `i18nService.translate('key')` call)

- [ ] **Step 2: Define a `XxxFormI18n` type with one `string` field per key (camelCase, no @ prefix)**

  Example for `task.form.ts`:
  ```ts
  export type TaskFormI18n = {
    state_label: string;
    priority_label: string;
    importance_label: string;
    // add every key
  };
  ```

- [ ] **Step 3: Add `public readonly i18n = input<TaskFormI18n>({ state_label: '', priority_label: '', ... })` with empty-string defaults**

- [ ] **Step 4: Replace all `'@key' | translate | async` in template with `i18n.fieldName()`**

- [ ] **Step 5: Remove `TranslatePipe`, `AsyncPipe`, `I18nService`, `PFX` imports from the file**

- [ ] **Step 6: Type-check each affected lib**

  ```bash
  npx tsc --noEmit -p libs/task/ui/tsconfig.json
  npx tsc --noEmit -p libs/user/ui/tsconfig.json
  npx tsc --noEmit -p libs/subject/group/ui/tsconfig.json
  npx tsc --noEmit -p libs/subject/person/ui/tsconfig.json
  npx tsc --noEmit -p libs/relationship/membership/ui/tsconfig.json
  npx tsc --noEmit -p libs/relationship/personal-rel/ui/tsconfig.json
  npx tsc --noEmit -p libs/relationship/reservation/ui/tsconfig.json
  npx tsc --noEmit -p libs/relationship/transfer/ui/tsconfig.json
  npx tsc --noEmit -p libs/relationship/workrel/ui/tsconfig.json
  npx tsc --noEmit -p libs/resource/ui/tsconfig.json
  npx tsc --noEmit -p libs/profile/ui/tsconfig.json
  npx tsc --noEmit -p libs/cms/page/ui/tsconfig.json
  ```

- [ ] **Step 7: Commit**

  ```bash
  git add libs/task/ui libs/user/ui libs/subject libs/relationship libs/resource/ui libs/profile/ui libs/cms/page/ui
  git commit -m "refactor(ui-forms): add typed i18n input(), remove TranslatePipe"
  ```

---

## Task 6: Migrate `auth` feature — create store, update 4 components

**New file:** `libs/auth/feature/src/lib/auth.store.ts`

- [ ] **Step 1: Read all 4 auth components to collect every translation key used**

  Files:
  - `libs/auth/feature/src/lib/login.page.ts`
  - `libs/auth/feature/src/lib/login.modal.ts`
  - `libs/auth/feature/src/lib/password-reset.page.ts`
  - `libs/auth/feature/src/lib/confirm-password-reset.page.ts`

  Run: `grep -n "translate\|PFX\|'@" libs/auth/feature/src/lib/login.page.ts libs/auth/feature/src/lib/login.modal.ts libs/auth/feature/src/lib/password-reset.page.ts libs/auth/feature/src/lib/confirm-password-reset.page.ts`

- [ ] **Step 2: Create `libs/auth/feature/src/lib/auth.store.ts`**

  ```ts
  import { inject } from '@angular/core';
  import { signalStore, withProps } from '@ngrx/signals';
  import { I18nService } from '@bk2/shared-i18n';
  import { PFX } from './scope';

  export const AuthStore = signalStore(
    withProps(() => ({ i18nService: inject(I18nService) })),
    withProps((store) => ({
      i18n: store.i18nService.translateAll({
        // All keys collected in Step 1 — one entry per unique key
        login_title:          PFX + 'login.title',
        // ...
      }),
    })),
  );
  ```

- [ ] **Step 3: Update each auth component**

  - Add `providers: [AuthStore]`
  - Add `protected readonly store = inject(AuthStore);`
  - Replace every `'@key' | translate | async` with `store.i18n.key()`
  - Remove `TranslatePipe`, `AsyncPipe`, `I18nService`, `PFX` imports

- [ ] **Step 4: Type-check**

  `npx tsc --noEmit -p libs/auth/feature/tsconfig.json`

- [ ] **Step 5: Commit**

  ```bash
  git add libs/auth/feature/
  git commit -m "refactor(auth): add AuthStore with i18n, remove TranslatePipe from components"
  ```

---

## Task 7: Migrate `category`, `folder`, `icon`, `geo/location`, `geo/flighttracker`

Each of these has one existing store. The migration for each domain is:

1. Read the store + component files.
2. In the store, add `i18nService: inject(I18nService)` to the first `withProps`, then add `i18n: store.i18nService.translateAll({...})` to a second `withProps`, collecting all keys from the component.
3. In the component, replace `I18nService` injection and `translateAll` call (or `TranslatePipe` usages) with `computed(() => this.store.i18n.key())`.
4. Remove `I18nService`, `PFX`, `TranslatePipe`, `AsyncPipe` from component imports.

**Files:**

| Store | Component(s) |
|-------|--------------|
| `libs/category/feature/src/lib/category.store.ts` | `libs/category/feature/src/lib/category-list.ts` |
| `libs/folder/feature/src/lib/folder.store.ts` | `libs/folder/feature/src/lib/folder-list.ts` |
| `libs/icon/feature/src/lib/icon.store.ts` | `libs/icon/feature/src/lib/icon-list.ts` |
| `libs/geo/location/feature/src/lib/location-list.store.ts` | `libs/geo/location/feature/src/lib/location-list.ts` |
| `libs/geo/flighttracker/feature/src/lib/flighttracker.store.ts` | `libs/geo/flighttracker/feature/src/lib/flighttracker-search.ts`, `flighttracker-detail.modal.ts` |

- [ ] **Step 1: For each domain — read store + component(s), collect all translation keys from component**
- [ ] **Step 2: Add `I18nService`/`PFX` import to store if not present; add `i18nService` to first `withProps`; add `i18n: store.i18nService.translateAll({...})` to second `withProps`**
- [ ] **Step 3: Update component(s): remove I18nService/PFX/TranslatePipe; use `this.store.i18n.key()`**
- [ ] **Step 4: Type-check each lib**

  ```bash
  npx tsc --noEmit -p libs/category/feature/tsconfig.json
  npx tsc --noEmit -p libs/folder/feature/tsconfig.json
  npx tsc --noEmit -p libs/icon/feature/tsconfig.json
  npx tsc --noEmit -p libs/geo/location/feature/tsconfig.json
  npx tsc --noEmit -p libs/geo/flighttracker/feature/tsconfig.json
  ```

- [ ] **Step 5: Commit**

  ```bash
  git add libs/category/feature libs/folder/feature libs/icon/feature libs/geo/
  git commit -m "refactor(category,folder,icon,location,flighttracker): migrate i18n to store"
  ```

---

## Task 8: Migrate `calevent` feature

**Store:** `libs/calevent/feature/src/lib/calevent.store.ts`

**Components (all use I18nService or TranslatePipe):**
- `libs/calevent/feature/src/lib/calevent-list.ts`
- `libs/calevent/feature/src/lib/calevent-view.modal.ts`
- `libs/calevent/feature/src/lib/attendees-accordion.ts`
- `libs/calevent/feature/src/lib/schedule-new.modal.ts`
- `libs/calevent/feature/src/lib/schedule-table.modal.ts`
- `libs/calevent/feature/src/lib/yearly-events.ts`

- [ ] **Step 1: Read all calevent component files and collect every translation key**
- [ ] **Step 2: Add all keys to `calevent.store.ts` `i18n` `translateAll` block (merge with any existing i18n)**
- [ ] **Step 3: Update each component: use `this.store.i18n.key()`, remove I18nService/PFX/TranslatePipe**

  Note: components like `attendees-accordion` and `schedule-new.modal` may inject the store from the parent rather than provide it themselves. Check whether they have `providers: [CalEventStore]` or inherit it.

- [ ] **Step 4: Type-check**

  `npx tsc --noEmit -p libs/calevent/feature/tsconfig.json`

- [ ] **Step 5: Commit**

  ```bash
  git add libs/calevent/feature/
  git commit -m "refactor(calevent): migrate i18n to CalEventStore"
  ```

---

## Task 9: Migrate `chat` feature

**Store:** `libs/chat/feature/src/lib/matrix-chat.store.ts`

**Components:**
- `libs/chat/feature/src/lib/matrix-chat.ts`

- [ ] **Step 1: Read `matrix-chat.ts` and collect all translation keys**
- [ ] **Step 2: Merge keys into `matrix-chat.store.ts` `i18n` block**
- [ ] **Step 3: Update `matrix-chat.ts`: use `this.store.i18n.key()`, remove I18nService/PFX/TranslatePipe**
- [ ] **Step 4: Type-check**

  `npx tsc --noEmit -p libs/chat/feature/tsconfig.json`

- [ ] **Step 5: Commit**

  ```bash
  git add libs/chat/feature/
  git commit -m "refactor(chat): migrate i18n to MatrixChatStore"
  ```

---

## Task 10: Migrate `cms/menu` feature

**Store:** `libs/cms/menu/feature/src/lib/menu.store.ts`

**Components:**
- `libs/cms/menu/feature/src/lib/menu.ts`
- `libs/cms/menu/feature/src/lib/menu-list.ts`

Additionally: `menu.form.ts` was updated in Task 5 to accept `i18n = input<MenuFormI18n>()`. The parent `menu.ts` must now pass a `formI18n` computed from `store.i18n`.

- [ ] **Step 1: Read `menu.ts` and `menu-list.ts`, collect all translation keys. Also collect `MenuFormI18n` keys needed by `menu.form.ts`**
- [ ] **Step 2: Add all keys to `menu.store.ts` `i18n` block (including form keys)**
- [ ] **Step 3: Update `menu.ts` and `menu-list.ts`**
- [ ] **Step 4: In `menu.ts` template, bind `[i18n]="formI18n()"` where `formI18n` is a computed from `store.i18n`**
- [ ] **Step 5: Type-check**

  `npx tsc --noEmit -p libs/cms/menu/feature/tsconfig.json`

- [ ] **Step 6: Commit**

  ```bash
  git add libs/cms/menu/feature/
  git commit -m "refactor(cms-menu): migrate i18n to MenuStore"
  ```

---

## Task 11: Migrate `cms/page` feature

**Stores:** `libs/cms/page/feature/src/lib/page.store.ts`, `libs/cms/page/feature/src/lib/menu-graph.store.ts`

**Components (most share `PageStore`):**
- `libs/cms/page/feature/src/lib/page-list.ts`
- `libs/cms/page/feature/src/lib/content.page.ts`
- `libs/cms/page/feature/src/lib/dashboard.page.ts`
- `libs/cms/page/feature/src/lib/blog.page.ts`
- `libs/cms/page/feature/src/lib/blog-stream.ts`
- `libs/cms/page/feature/src/lib/landing.page.ts`
- `libs/cms/page/feature/src/lib/error.page.ts`
- `libs/cms/page/feature/src/lib/files.page.ts`
- `libs/cms/page/feature/src/lib/graph.page.ts`

- [ ] **Step 1: Read each page component, collect all unique translation keys. Note which store each component uses (check `providers` and `inject` calls)**
- [ ] **Step 2: Add collected keys to the appropriate store's `i18n` block**
- [ ] **Step 3: Update each component: use `this.store.i18n.key()`, remove I18nService/PFX/TranslatePipe/AsyncPipe**
- [ ] **Step 4: Type-check**

  `npx tsc --noEmit -p libs/cms/page/feature/tsconfig.json`

- [ ] **Step 5: Commit**

  ```bash
  git add libs/cms/page/feature/
  git commit -m "refactor(cms-page): migrate i18n to PageStore"
  ```

---

## Task 12: Migrate `cms/section` feature components

**Stores:** many under `libs/cms/section/feature/`

**Components:**
- `libs/cms/section/feature/src/lib/accordion-section.ts`
- `libs/cms/section/feature/src/lib/album-section.ts`
- `libs/cms/section/feature/src/lib/button-section.ts`
- `libs/cms/section/feature/src/lib/calendar-section.ts`
- `libs/cms/section/feature/src/lib/context-diagram-config.modal.ts`
- `libs/cms/section/feature/src/lib/events-section.ts`
- `libs/cms/section/feature/src/lib/message-center.modal.ts`
- `libs/cms/section/feature/src/lib/missing-section.ts`
- `libs/cms/section/feature/src/lib/orgchart-section.ts`
- `libs/cms/section/feature/src/lib/section-list.ts`
- `libs/cms/section/feature/src/lib/section-preview.modal.ts`
- `libs/cms/section/feature/src/lib/table-section.ts`

- [ ] **Step 1: For each component, identify its store (via `providers: [XxxStore]` or `inject(XxxStore)`) and read both files**
- [ ] **Step 2: Collect all translation keys from the component; add to the store's `i18n` block**
- [ ] **Step 3: Update the component to use `this.store.i18n.key()`, remove I18nService/PFX/TranslatePipe**
- [ ] **Step 4: Type-check**

  `npx tsc --noEmit -p libs/cms/section/feature/tsconfig.json`

- [ ] **Step 5: Commit**

  ```bash
  git add libs/cms/section/feature/
  git commit -m "refactor(cms-section): migrate i18n to section stores"
  ```

---

## Task 13: Migrate `aoc` feature (15 components)

Each AOC component currently has `i18n` defined in the COMPONENT via `I18nService.translateAll`. Each also has a corresponding store that already uses `I18nService` internally.

**Pattern:** Move `i18n = this.i18nService.translateAll({...})` from the COMPONENT into the STORE (merge with any existing store `i18n`).

**Pairs to migrate:**

| Store | Component |
|-------|-----------|
| `aoc-adminops.store.ts` | `aoc-adminops.ts` |
| `aoc-bexio.store.ts` | `aoc-bexio.ts` |
| `aoc-chat.store.ts` | `aoc-chat.ts` |
| `aoc-content.store.ts` | `aoc-content.ts` |
| `aoc-data.store.ts` | `aoc-data.ts` |
| `aoc-doc.store.ts` | `aoc-doc.ts` |
| `aoc-roles.store.ts` | `aoc-roles.ts` |
| `aoc-srv.store.ts` | `aoc-srv.ts` |
| `aoc-statistics.store.ts` | `aoc-statistics.ts` |
| `aoc-storage.store.ts` | `aoc-storage.ts` |
| `aoc-tag.store.ts` | `aoc-tag.ts` |
| `aoc-user-account.store.ts` | `aoc-user-account.ts` |
| `aoc-website.store.ts` | `aoc-website.ts` + `aoc-website-edit.modal.ts` |
| (no separate store) | `aoc-session.store.ts` (N/A — no component) |

All files are in `libs/aoc/feature/src/lib/`.

- [ ] **Step 1: For each pair — read both files. Copy the `i18n` keys object from the component's `translateAll` call. Merge into the store's `translateAll` (store may already have some keys for internal error messages)**
- [ ] **Step 2: Ensure store has `i18nService: inject(I18nService)` in its first `withProps`, and `i18n: store.i18nService.translateAll({...merged keys...})` in a second `withProps`**
- [ ] **Step 3: Update each component: remove `i18nService = inject(I18nService)` and `i18n = this.i18nService.translateAll({...})`. Change template bindings from `i18n.key()` to `store.i18n.key()`. Remove I18nService/PFX imports**
- [ ] **Step 4: Type-check**

  `npx tsc --noEmit -p libs/aoc/feature/tsconfig.json`

- [ ] **Step 5: Commit**

  ```bash
  git add libs/aoc/feature/
  git commit -m "refactor(aoc): move component i18n translateAll into stores"
  ```

---

## Task 14: Migrate `comment`, `document` features

| Store | Component(s) |
|-------|--------------|
| `libs/comment/feature/src/lib/comment-list.store.ts` | `comments-accordion.ts`, `comments-card.ts` |
| `libs/document/feature/src/lib/document.store.ts` | `document-accordion.ts`, `document-list.ts`, `image-select.modal.ts` |

- [ ] **Step 1: Read each component, collect translation keys**
- [ ] **Step 2: Add to respective store's `i18n` block**
- [ ] **Step 3: Update components**
- [ ] **Step 4: Type-check**

  ```bash
  npx tsc --noEmit -p libs/comment/feature/tsconfig.json
  npx tsc --noEmit -p libs/document/feature/tsconfig.json
  ```

- [ ] **Step 5: Commit**

  ```bash
  git add libs/comment/feature/ libs/document/feature/
  git commit -m "refactor(comment,document): migrate i18n to stores"
  ```

---

## Task 15: Migrate `finance` features (account, bill, invoice, journal)

| Store | Component(s) |
|-------|--------------|
| `libs/finance/account/feature/src/lib/account.store.ts` | `account-list.ts` |
| `libs/finance/bill/feature/src/lib/bill.store.ts` | `bill-list.ts`, `bill-accordion.ts`, `bill-view.modal.ts` |
| `libs/finance/invoice/feature/src/lib/invoice.store.ts` | `invoice-list.ts`, `invoice-accordion.ts`, `invoice-view.modal.ts` |
| `libs/finance/journal/feature/src/lib/journal.store.ts` | `journal-list.ts`, `journal-view.modal.ts` |

- [ ] **Step 1: Read each component, collect translation keys**
- [ ] **Step 2: Add to respective store's `i18n` block**
- [ ] **Step 3: Update each component**
- [ ] **Step 4: Type-check**

  ```bash
  npx tsc --noEmit -p libs/finance/account/feature/tsconfig.json
  npx tsc --noEmit -p libs/finance/bill/feature/tsconfig.json
  npx tsc --noEmit -p libs/finance/invoice/feature/tsconfig.json
  npx tsc --noEmit -p libs/finance/journal/feature/tsconfig.json
  ```

- [ ] **Step 5: Commit**

  ```bash
  git add libs/finance/
  git commit -m "refactor(finance): migrate i18n to stores"
  ```

---

## Task 16: Migrate `relationship` features

| Store | Component(s) |
|-------|--------------|
| `libs/relationship/invitation/feature/.../invitation.store.ts` | `invitation-list.ts`, `invitees-accordion.ts` |
| `libs/relationship/membership/feature/.../membership.store.ts` | `membership-list.ts`, `membership-accordion.ts`, `members-accordion.ts` |
| `libs/relationship/membership/feature/.../scs-member-fees.store.ts` | `scs-member-fees-list.ts`, `scs-member-fees-totals.modal.ts` |
| `libs/relationship/ownership/feature/.../ownership.store.ts` | `ownership-list.ts`, `ownerships-accordion.ts`, `ownership-new.form.ts` |
| `libs/relationship/personal-rel/feature/.../personal-rel.store.ts` | `personal-rel-list.ts`, `personal-rel-accordion.ts` |
| `libs/relationship/reservation/feature/.../reservation.store.ts` | `reservation-list.ts`, `reservations-accordion.ts` |
| `libs/relationship/responsibility/feature/.../responsibility.store.ts` | `responsibility-list.ts` |
| `libs/relationship/transfer/feature/.../transfer.store.ts` | `transfer-list.ts` |
| `libs/relationship/workrel/feature/.../workrel.store.ts` | `workrel-list.ts`, `workrel-accordion.ts` |

Additionally, `libs/relationship/membership/ui` forms were updated in Task 5. The `membership.store.ts` must include their keys so the parent component can pass `formI18n`.

- [ ] **Step 1: Read each component, collect translation keys (including form keys for membership)**
- [ ] **Step 2: Add to respective store's `i18n` block**
- [ ] **Step 3: Update each component**
- [ ] **Step 4: For components that have child form components (e.g. membership), add `formI18n = computed<MembershipFormI18n>(() => ({...}))` and bind in template**
- [ ] **Step 5: Type-check**

  ```bash
  npx tsc --noEmit -p libs/relationship/invitation/feature/tsconfig.json
  npx tsc --noEmit -p libs/relationship/membership/feature/tsconfig.json
  npx tsc --noEmit -p libs/relationship/ownership/feature/tsconfig.json
  npx tsc --noEmit -p libs/relationship/personal-rel/feature/tsconfig.json
  npx tsc --noEmit -p libs/relationship/reservation/feature/tsconfig.json
  npx tsc --noEmit -p libs/relationship/responsibility/feature/tsconfig.json
  npx tsc --noEmit -p libs/relationship/transfer/feature/tsconfig.json
  npx tsc --noEmit -p libs/relationship/workrel/feature/tsconfig.json
  ```

- [ ] **Step 6: Commit**

  ```bash
  git add libs/relationship/
  git commit -m "refactor(relationship): migrate i18n to stores"
  ```

---

## Task 17: Migrate `resource` feature

**Stores:** `libs/resource/feature/src/lib/resource-list.store.ts`, `resource-edit.store.ts`

**Components:**
- `libs/resource/feature/src/lib/resource-list.ts`
- `libs/resource/feature/src/lib/key-list.ts`
- `libs/resource/feature/src/lib/locker-list.ts`
- `libs/resource/feature/src/lib/rowing-boat-list.ts`

`libs/resource/ui/resource.form.ts` was updated in Task 5 to accept `i18n = input<ResourceFormI18n>()`. Parent must pass `formI18n` from `store.i18n`.

- [ ] **Step 1: Read components, collect keys (including form keys)**
- [ ] **Step 2: Add to store's `i18n` block**
- [ ] **Step 3: Update components**
- [ ] **Step 4: Type-check**

  `npx tsc --noEmit -p libs/resource/feature/tsconfig.json`

- [ ] **Step 5: Commit**

  ```bash
  git add libs/resource/
  git commit -m "refactor(resource): migrate i18n to stores"
  ```

---

## Task 18: Migrate `task` feature

**Store:** `libs/task/feature/src/lib/task.store.ts`

**Components:**
- `libs/task/feature/src/lib/task-list.ts`

`libs/task/ui/task.form.ts` was updated in Task 5 to accept `i18n = input<TaskFormI18n>()`. `task-list.ts` must bind `[i18n]="formI18n()"`.

- [ ] **Step 1: Read `task-list.ts`, collect its own keys AND `TaskFormI18n` keys**
- [ ] **Step 2: Add all keys to `task.store.ts` `i18n` block**
- [ ] **Step 3: Update `task-list.ts`**: use `this.store.i18n.key()`, add `formI18n = computed<TaskFormI18n>(() => ({...}))`, bind to form**
- [ ] **Step 4: Type-check**

  `npx tsc --noEmit -p libs/task/feature/tsconfig.json`

- [ ] **Step 5: Commit**

  ```bash
  git add libs/task/
  git commit -m "refactor(task): migrate i18n to TaskStore, wire formI18n"
  ```

---

## Task 19: Migrate `subject` features (address, group, org, person)

| Store | Component(s) |
|-------|--------------|
| `libs/subject/address/feature/.../addresses.store.ts` | `addresses-list.ts`, `addresses-accordion.ts`, `address-edit.modal.ts` |
| `libs/subject/group/feature/.../group.store.ts` | `group-list.ts`, `group-view.page.ts` |
| `libs/subject/org/feature/.../org.store.ts` | `org-list.ts` |
| `libs/subject/person/feature/.../person.store.ts` | `person-list.ts` |

UI forms (`group.form.ts`, `person-new.form.ts`) were updated in Task 5. Parents must pass `formI18n`.

- [ ] **Step 1: Read components, collect keys (including child form keys)**
- [ ] **Step 2: Add to store's `i18n` block**
- [ ] **Step 3: Update components; wire `formI18n` bindings where needed**
- [ ] **Step 4: Type-check**

  ```bash
  npx tsc --noEmit -p libs/subject/address/feature/tsconfig.json
  npx tsc --noEmit -p libs/subject/group/feature/tsconfig.json
  npx tsc --noEmit -p libs/subject/org/feature/tsconfig.json
  npx tsc --noEmit -p libs/subject/person/feature/tsconfig.json
  ```

- [ ] **Step 5: Commit**

  ```bash
  git add libs/subject/
  git commit -m "refactor(subject): migrate i18n to stores"
  ```

---

## Task 20: Migrate `user`, `profile`, `i18n` admin features

| Store | Component(s) |
|-------|--------------|
| `libs/user/feature/.../user-list.store.ts` | `user-list.ts` |
| `libs/user/feature/.../user-edit.store.ts` | (edit modal if any) |
| `libs/profile/feature/.../profile-edit.store.ts` | `profile-edit.page.ts` |
| `libs/i18n/feature/.../i18n-default.store.ts` | `i18n-default-list.ts`, `i18n-default-edit.modal.ts` |
| `libs/i18n/feature/.../i18n-override.store.ts` | `i18n-override-list.ts`, `i18n-override-edit.modal.ts` |

UI forms from `libs/user/ui/` were updated in Task 5. Parents must pass `formI18n`.

- [ ] **Step 1: Read components, collect keys**
- [ ] **Step 2: Add to store's `i18n` block**
- [ ] **Step 3: Update components; wire `formI18n` bindings**
- [ ] **Step 4: Type-check**

  ```bash
  npx tsc --noEmit -p libs/user/feature/tsconfig.json
  npx tsc --noEmit -p libs/profile/feature/tsconfig.json
  npx tsc --noEmit -p libs/i18n/feature/tsconfig.json
  ```

- [ ] **Step 5: Commit**

  ```bash
  git add libs/user/ libs/profile/ libs/i18n/
  git commit -m "refactor(user,profile,i18n-admin): migrate i18n to stores"
  ```

---

## Task 21: Migrate `shared/feature` multi-select modal

- `libs/shared/feature/src/lib/multi-select.modal.ts`

This component injects I18nService. It may need a minimal store or the parent passes i18n strings via component props (via ModalController's `componentProps`).

- [ ] **Step 1: Read the component to understand how it uses I18nService**
- [ ] **Step 2: If it uses 1-3 keys, pass them as `componentProps` when calling `ModalController.create()`; add `input()` signals for those strings**
- [ ] **Step 3: Remove I18nService/PFX/TranslatePipe**
- [ ] **Step 4: Type-check**

  `npx tsc --noEmit -p libs/shared/feature/tsconfig.json`

- [ ] **Step 5: Commit**

  ```bash
  git add libs/shared/feature/
  git commit -m "refactor(shared-feature): remove I18nService from multi-select modal"
  ```

---

## Task 22: Update documentation in `CLAUDE.md`

Find and update the i18n section in the project's `CLAUDE.md`.

- [ ] **Step 1: Open `CLAUDE.md` and locate the i18n/Transloco description**
- [ ] **Step 2: Replace with the following text (adapt surrounding context as needed):**

  ```markdown
  ### i18n (Transloco)

  Default language: `de`. Translation keys use `@domain.key` format.
  Per-module i18n JSON files live in each lib's `src/i18n/` folder.

  #### The i18n pattern (store-driven)

  All i18n string resolution happens **inside NgRx Signal Stores**, never in components.

  **In the store:**
  ```ts
  // First withProps: inject I18nService (and other services)
  withProps(() => ({
    i18nService: inject(I18nService),
    // other services...
  })),
  // Second withProps: build the i18n object — one entry per UI string
  withProps((store) => ({
    i18n: store.i18nService.translateAll({
      title:   PFX + 'title',
      empty:   PFX + 'empty',
      // ...
    }),
  })),
  ```

  **In the feature component:**
  ```ts
  // No I18nService, no PFX, no TranslatePipe, no AsyncPipe
  protected readonly store = inject(FeatureStore);
  protected readonly title = computed(() => this.store.i18n.title());
  ```

  Template: `{{ title() }}` — never `{{ '@key' | translate | async }}`.

  **Shared/UI components** (e.g. `bk-text-input`, `bk-empty-list`) accept pre-translated `string` inputs.
  The calling feature component passes `[label]="store.i18n.label()"`.

  **UI-layer form components** receive a single typed `i18n = input<XxxFormI18n>()` object.
  The parent feature component computes it from `store.i18n` and binds `[i18n]="formI18n()"`.

  Only **stores** import `I18nService` and `PFX`. Components import neither.
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add CLAUDE.md
  git commit -m "docs(CLAUDE): document store-driven i18n pattern"
  ```

---

## Final Verification

- [ ] **Run a global grep to confirm no feature/ui component still imports I18nService or PFX:**

  ```bash
  grep -rl "I18nService\|TranslatePipe" libs --include="*.ts" \
    | grep -v "\.store\.ts\|service\.ts\|spec\.\|scope\.ts\|\.pipe\.ts\|i18n\.service\.ts"
  ```

  Expected: empty output (or only legitimate exceptions documented here).

- [ ] **Run full tsc check on all affected libs:**

  ```bash
  pnpm nx run-many --target=build --all 2>&1 | grep -E "error TS|ERROR"
  ```

- [ ] **Final commit if any stray fixes:**

  ```bash
  git add -p
  git commit -m "refactor(i18n): final cleanup — no remaining I18nService in feature components"
  ```

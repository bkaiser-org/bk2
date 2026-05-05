# Notification Badges Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show open-task count in the Tasks card title and a combined (unread-chat + open-task) badge on the dashboard sidebar menu item.

**Architecture:** Add an optional `count` input to `OptionalCardHeaderComponent` and an optional `badge` input to `MultiAvatarComponent`; wire the task count from `TasksSectionComponent`; add `MatrixChatService` + a notification `rxResource` to `MenuStore` (guarded to only query when `name === 'dashboard'`); pass the count through `MenuComponent` to `MultiAvatarComponent`.

**Tech Stack:** Angular 20 signals, NgRx Signal Stores (`@ngrx/signals`), `rxResource` (`@angular/core/rxjs-interop`), Ionic standalone components, RxJS `combineLatest`.

---

## File Map

| Action | Path | What changes |
|--------|------|-------------|
| Modify | `libs/shared/ui/src/lib/optional-card-header.component.ts` | Add `count` input + badge in title row |
| Modify | `libs/cms/section/feature/src/lib/tasks-section.component.ts` | Pass `[count]="numberOfTasks()"` |
| Modify | `libs/cms/menu/ui/src/lib/multi-avatar.ts` | Add `badge` input + `ion-badge` in all three item variants |
| Modify | `libs/cms/menu/feature/tsconfig.json` | Add chat-data-access reference |
| Modify | `libs/cms/menu/feature/package.json` | Add `@bk2/chat-data-access` dependency |
| Modify | `libs/cms/menu/feature/src/lib/menu.store.ts` | Inject `MatrixChatService`, add `notificationCountResource` + `notificationCount` |
| Modify | `libs/cms/menu/feature/src/lib/menu.component.ts` | Add `notificationCount` computed, pass `[badge]` to `bk-multi-avatar` |

---

## Task 1: Add count badge to `OptionalCardHeaderComponent`

**Files:**
- Modify: `libs/shared/ui/src/lib/optional-card-header.component.ts`

- [ ] **Step 1: Replace the file content**

```typescript
import { AsyncPipe } from '@angular/common';
import { Component, computed, input } from '@angular/core';
import { IonBadge, IonCardHeader, IonCardSubtitle, IonCardTitle } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';

@Component({
  selector: 'bk-optional-card-header',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe,
    IonCardHeader, IonCardTitle, IonCardSubtitle, IonBadge
  ],
  styles: [`
  /* iOS places the subtitle above the title */
  ion-card-header { display: flex; flex-flow: column-reverse; padding-bottom: 0px; }
  .title-row { display: flex; align-items: center; justify-content: space-between; }
`],
  template: `
    @if(doShowHeader()) {
      <ion-card-header>
        @if(title()) {
          <div class="title-row">
            <ion-card-title>{{ title() | translate | async }}</ion-card-title>
            @if((count() ?? 0) > 0) {
              <ion-badge color="danger">{{ count() }}</ion-badge>
            }
          </div>
        }
        @if(subTitle()) {
          <ion-card-subtitle>{{ subTitle() | translate | async }} </ion-card-subtitle>
        }
      </ion-card-header>
    }
  `
})
export class OptionalCardHeaderComponent {
  public title = input<string | undefined>();
  public subTitle = input<string | undefined>();
  public count = input<number>();

  protected doShowHeader = computed(() => !!this.title() || !!this.subTitle());
}
```

- [ ] **Step 2: Type-check `shared/ui`**

```bash
npx tsc --noEmit -p libs/shared/ui/tsconfig.json
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add libs/shared/ui/src/lib/optional-card-header.component.ts
git commit -m "feat(shared-ui): add count badge to OptionalCardHeaderComponent"
```

---

## Task 2: Wire task count into the Tasks card header

**Files:**
- Modify: `libs/cms/section/feature/src/lib/tasks-section.component.ts` (line 45)

- [ ] **Step 1: Update the `<bk-optional-card-header>` usage**

Find line 45:
```html
            <bk-optional-card-header [title]="title()" [subTitle]="subTitle()" />
```

Replace with:
```html
            <bk-optional-card-header [title]="title()" [subTitle]="subTitle()" [count]="numberOfTasks()" />
```

- [ ] **Step 2: Type-check `cms/section/feature`**

```bash
npx tsc --noEmit -p libs/cms/section/feature/tsconfig.json
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add libs/cms/section/feature/src/lib/tasks-section.component.ts
git commit -m "feat(tasks-section): show open task count in card title badge"
```

---

## Task 3: Add `badge` input to `MultiAvatarComponent`

**Files:**
- Modify: `libs/cms/menu/ui/src/lib/multi-avatar.ts`

- [ ] **Step 1: Replace the file content**

```typescript
import { Component, computed, input } from '@angular/core';
import { IonBadge, IonIcon, IonAvatar, IonImg, IonItem, IonLabel } from '@ionic/angular/standalone';

import { SvgIconPipe } from '@bk2/shared-pipes';
import { extractFirstPartOfOptionalTupel } from '@bk2/shared-util-core';

import { AvatarPipe } from '@bk2/avatar-ui';
import { AsyncPipe } from '@angular/common';
import { TranslatePipe } from '@bk2/shared-i18n';

@Component({
  selector: 'bk-multi-avatar',
  standalone: true,
  imports: [
    SvgIconPipe, AvatarPipe, AsyncPipe, TranslatePipe,
    IonBadge, IonIcon, IonAvatar, IonImg, IonItem, IonLabel
  ],
  styles: [`
    ion-item::part(native) {
      transition: background-color 0.2s ease;
    }
    
    ion-item:hover::part(native) {
      background: rgba(0, 0, 0, 0.08);
    }
    
    ion-icon { color: var(--ion-color-dark); }
    .letter { color: black; }
    
    @media (prefers-color-scheme: dark) {
      ion-item:hover::part(native) {
        background: rgba(255, 255, 255, 0.12);
      }
      
      ion-icon { color: var(--ion-color-white); }
      .letter { color: white; }
    }
    
    .letter-avatar {
      background: var(--ion-color-light);
      .letter {
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 15px;
        font-weight: bold;
      }    
    }
`],
  template: `
    @if(icon(); as icon) {
      @if(name(); as name) {
        @if (icon.startsWith('@@')) {
          <ion-item [button]="true">
            <ion-avatar slot="start" class="letter-avatar">
              <div class="letter">{{ name }}</div>
            </ion-avatar> 
            <ion-label>{{ label() | translate | async }}</ion-label>
            @if(badge() > 0) {
              <ion-badge slot="end" color="danger">{{ badge() }}</ion-badge>
            }
          </ion-item>
        } @else {
          @if(icon.startsWith('//')) {
            <ion-item [button]="true">
              <ion-avatar slot="start" [style.background-color]="'var(--ion-color-light)'">
                <ion-img src="{{ name | avatar:getModelName(name) }}" alt="Avatar Logo" />
              </ion-avatar>
              <ion-label>{{ label() | translate | async }}</ion-label>
              @if(badge() > 0) {
                <ion-badge slot="end" color="danger">{{ badge() }}</ion-badge>
              }
            </ion-item>
          }
        }
      } @else {
        <ion-item [button]="true">
          <ion-icon slot="start" src="{{icon | svgIcon }}" />
          <ion-label>{{ label() | translate | async }}</ion-label>
          @if(badge() > 0) {
            <ion-badge slot="end" color="danger">{{ badge() }}</ion-badge>
          }
        </ion-item>
      }
    }
  `
})
export class MultiAvatarComponent {
  public icon = input.required<string>();
  public label = input<string>();
  public badge = input<number>(0);

  protected name = computed(() => {
    const icon = this.icon();
    if (icon.startsWith('@@')) return icon.substring(2, 3);
    if (icon.startsWith('//')) return icon.substring(2);
    return undefined;
  });

  protected getModelName(key: string): string {
    return extractFirstPartOfOptionalTupel(key);
  }
}
```

- [ ] **Step 2: Type-check `cms/menu/ui`**

```bash
npx tsc --noEmit -p libs/cms/menu/ui/tsconfig.json
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add libs/cms/menu/ui/src/lib/multi-avatar.ts
git commit -m "feat(cms-menu-ui): add badge input to MultiAvatarComponent"
```

---

## Task 4: Add `@bk2/chat-data-access` to `cms-menu-feature` lib config

**Files:**
- Modify: `libs/cms/menu/feature/tsconfig.json`
- Modify: `libs/cms/menu/feature/package.json`

- [ ] **Step 1: Add chat-data-access reference to `tsconfig.json`**

In `libs/cms/menu/feature/tsconfig.json`, add to the `references` array (after the last existing entry):
```json
    {"path": "../../../chat/data-access/tsconfig.lib.json"}
```

The full `references` array should end with:
```json
    {"path": "../../../auth/data-access/tsconfig.lib.json"},
    {"path": "../../../activity/data-access/tsconfig.lib.json"},
    {"path": "../../../activity/util/tsconfig.lib.json"},
    {"path": "../../../chat/data-access/tsconfig.lib.json"}
  ]
```

- [ ] **Step 2: Add `@bk2/chat-data-access` to `package.json`**

In `libs/cms/menu/feature/package.json`, add to the `dependencies` object:
```json
    "@bk2/chat-data-access": "*"
```

The full dependencies block should include (among others):
```json
    "@bk2/activity-data-access": "*",
    "@bk2/chat-data-access": "*"
```

- [ ] **Step 3: Commit**

```bash
git add libs/cms/menu/feature/tsconfig.json libs/cms/menu/feature/package.json
git commit -m "chore(cms-menu-feature): add chat-data-access dependency"
```

---

## Task 5: Add notification count to `MenuStore`

**Files:**
- Modify: `libs/cms/menu/feature/src/lib/menu.store.ts`

- [ ] **Step 1: Add new imports at the top of the file**

After the existing import block, add these imports:

```typescript
import { combineLatest, of } from 'rxjs';
import { map } from 'rxjs/operators';

import { MatrixChatService } from '@bk2/chat-data-access';
import { TaskCollection, TaskModel } from '@bk2/shared-models';
import { getSystemQuery } from '@bk2/shared-util-core';
```

- [ ] **Step 2: Add `matrixChatService` to the first `withProps` block**

Find the first `withProps` block (the one with all the `inject(...)` calls). Add `matrixChatService` to it:

```typescript
  withProps(() => ({
    appStore: inject(AppStore),
    menuService: inject(MenuService),
    env: inject(ENV),
    modalController: inject(ModalController),
    appNavigationService: inject(AppNavigationService),
    router: inject(Router),
    menuController: inject(MenuController),
    popoverController: inject(PopoverController),
    authService: inject(AuthService),
    activityService: inject(ActivityService),
    matrixChatService: inject(MatrixChatService),
  })),
```

- [ ] **Step 3: Add `notificationCountResource` to the second `withProps` block**

Find the second `withProps` block (the one with `menuItemsResource` and `menuResource`). Add `notificationCountResource`:

```typescript
  withProps((store) => ({
    menuItemsResource: rxResource({
      stream: () => {
        return store.menuService.list();
      }
    }),
    menuResource: rxResource({
      params: () => ({
        name: store.name()
      }),
      stream: ({ params }) => {
        return store.menuService.read(params.name);
      }
    }),
    notificationCountResource: rxResource({
      params: () => ({
        name: store.name(),
        personKey: store.appStore.currentUser()?.personKey,
        tenantId: store.appStore.env.tenantId,
      }),
      stream: ({ params }) => {
        const { name, personKey, tenantId } = params;
        if (name !== 'dashboard' || !personKey) return of(0);

        const chatCount$ = store.matrixChatService.rooms.pipe(
          map(rooms => rooms.reduce((sum: number, r) => sum + r.unreadCount, 0))
        );

        const taskQuery = getSystemQuery(tenantId);
        taskQuery.push({ key: 'completionDate', operator: '==', value: '' });
        const taskCount$ = store.appStore.firestoreService.searchData<TaskModel>(TaskCollection, taskQuery, 'dueDate', 'asc').pipe(
          map(tasks => tasks.filter(t => t.assignee?.key === personKey || t.author?.key === personKey).length)
        );

        return combineLatest([chatCount$, taskCount$]).pipe(
          map(([chat, tasks]) => chat + tasks)
        );
      }
    }),
  })),
```

- [ ] **Step 4: Add `notificationCount` to `withComputed`**

Find the `withComputed` block. Add `notificationCount`:

```typescript
  withComputed((state) => {
    return {
      menuItems: computed(() => state.menuItemsResource.value()),
      menuItemsCount: computed(() => state.menuItemsResource.value()?.length ?? 0),
      filteredMenuItems: computed(() => 
        state.menuItemsResource.value()?.filter((menuItem: MenuItemModel) => 
          nameMatches(menuItem.index, state.searchTerm()) && 
          nameMatches(menuItem.action, state.selectedCategory())   
      )),
      menu: computed(() => state.menuResource.value() ?? undefined),
      currentUser: computed(() => state.appStore.currentUser()),
      isMenuLoading: computed(() => state.menuResource.isLoading()),
      isLoading: computed(() => state.menuItemsResource.isLoading() || state.menuResource.isLoading()),
      notificationCount: computed(() => state.notificationCountResource.value() ?? 0),
    };
  }),
```

- [ ] **Step 5: Type-check `cms/menu/feature`**

```bash
npx tsc --noEmit -p libs/cms/menu/feature/tsconfig.json
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add libs/cms/menu/feature/src/lib/menu.store.ts
git commit -m "feat(cms-menu-feature): add notification count to MenuStore"
```

---

## Task 6: Wire badge through `MenuComponent`

**Files:**
- Modify: `libs/cms/menu/feature/src/lib/menu.component.ts`

- [ ] **Step 1: Add `notificationCount` computed signal to the class**

In `MenuComponent`, after `protected readonly isVisible = computed(...)`, add:

```typescript
  protected readonly notificationCount = computed(() => this.menuStore.notificationCount());
```

- [ ] **Step 2: Pass `[badge]` to all three `bk-multi-avatar` usages**

In the template, update all three `<bk-multi-avatar>` usages (inside `navigate`, `browse`, and `call` cases) to include `[badge]="notificationCount()"`:

```html
            @case('navigate') {
              <bk-multi-avatar [icon]="icon()" [label]="label()" [badge]="notificationCount()" (click)="select(menuItem)" />
            }
            @case('browse') {
              <bk-multi-avatar [icon]="icon()" [label]="label()" [badge]="notificationCount()" (click)="select(menuItem)" />
            }
```

and:

```html
            @case('call') {
              <bk-multi-avatar [icon]="icon()" [label]="label()" [badge]="notificationCount()" (click)="select(menuItem)" />
            }
```

- [ ] **Step 3: Type-check `cms/menu/feature`**

```bash
npx tsc --noEmit -p libs/cms/menu/feature/tsconfig.json
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add libs/cms/menu/feature/src/lib/menu.component.ts
git commit -m "feat(cms-menu-feature): show notification badge on dashboard menu item"
```

---

## Task 7: Final build verification

- [ ] **Step 1: Build `shared/ui`**

```bash
pnpm nx build shared-ui
```

Expected: successful build, no errors.

- [ ] **Step 2: Build `cms-menu-ui`**

```bash
pnpm nx build cms-menu-ui
```

Expected: successful build, no errors.

- [ ] **Step 3: Build `cms-menu-feature`**

```bash
pnpm nx build cms-menu-feature
```

Expected: successful build, no errors.

- [ ] **Step 4: Build `cms-section-feature`**

```bash
pnpm nx build cms-section-feature
```

Expected: successful build, no errors.

- [ ] **Step 5: Serve app and verify manually**

```bash
pnpm nx serve scs-app
```

Open the app in a browser. Verify:
1. Dashboard tasks card shows a red badge with the open task count next to the card title (e.g. "Aufgaben **3**").
2. When there are no open tasks, no badge appears on the tasks card.
3. The dashboard sidebar menu item shows a combined red badge with unread-chats + open-tasks total when the sum > 0.
4. All other sidebar menu items show no badge.
5. When all tasks are completed and all chats read, the dashboard menu badge disappears.

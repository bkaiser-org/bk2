# Notification Badges Design

**Date:** 2026-05-05
**Status:** Approved

## Overview

Two related UI enhancements to surface pending-action counts:

1. Show the number of open tasks in the **Tasks card title** on the dashboard.
2. Show a combined notification count (unread chats + open tasks) as a badge on the **dashboard menu item**.

## Feature 1 — Tasks Card Title Badge

### Goal

When there are open (incomplete) tasks assigned to or authored by the current user, show the count as a red badge in the tasks section card header, next to the title.

### Files changed

**`libs/shared/ui/src/lib/optional-card-header.component.ts`**

- Add `count = input<number>()`.
- When `(count() ?? 0) > 0`, render `<ion-badge color="danger">{{ count() }}</ion-badge>` to the right of the `ion-card-title`.
- Wrap title + badge in a `<div class="title-row">` with `display: flex; align-items: center; justify-content: space-between`.
- Add `IonBadge` to standalone imports.

**`libs/cms/section/feature/src/lib/tasks-section.component.ts`**

- Pass `[count]="numberOfTasks()"` to `<bk-optional-card-header>`. No other changes.

### Behaviour

- Badge is hidden when `numberOfTasks() === 0` (the `@if` guard handles this).
- When tasks are loading, `isLoading()` shows the spinner, so the badge is not visible yet (no change needed there).
- The messages section card header is **not** changed — unread counts are already shown per-room in the list.

---

## Feature 2 — Dashboard Menu Item Badge

### Goal

The sidebar menu item with key `'dashboard'` shows a red badge with the total count of: unread Matrix chat messages + open tasks for the current user. The badge is hidden when the count is zero.

### Architecture decision

Computed in `MenuStore` (Option A). The `MenuStore` is `providers: [MenuStore]` in `MenuComponent`, so each menu item gets its own store instance. Only the instance where `name === 'dashboard'` subscribes to real data; all other instances return `of(0)` immediately via the rxResource guard.

### Files changed

**`libs/cms/menu/ui/src/lib/multi-avatar.ts`**

- Add `badge = input<number>(0)`.
- Add `@if(badge() > 0) { <ion-badge slot="end" color="danger">{{ badge() }}</ion-badge> }` inside all three `ion-item` variants (letter-avatar, image-avatar, icon).
- Add `IonBadge` to standalone imports.

**`libs/cms/menu/feature/src/lib/menu.store.ts`**

- Add to `withProps`: `matrixChatService: inject(MatrixChatService)` (from `@bk2/chat-data-access`).
- Add `notificationCountResource: rxResource` with:
  - `params: () => ({ name: store.name(), personKey: store.appStore.currentUser()?.personKey })`
  - `stream`: guard — if `params.name !== 'dashboard'` or `!params.personKey`, return `of(0)`.
  - Otherwise `combineLatest`:
    - **chat count**: `store.matrixChatService.rooms.pipe(map(rooms => rooms.reduce((sum, r) => sum + r.unreadCount, 0)))`
    - **task count**: `store.appStore.firestoreService.searchData<TaskModel>(TaskCollection, query).pipe(map(tasks => tasks.filter(t => t.assignee?.key === personKey || t.author?.key === personKey).length))`  where `query` uses `getSystemQuery(tenantId)` + `completionDate == ''`.
  - Map the combined result: `([chat, tasks]) => chat + tasks`.
- Add to `withComputed`: `notificationCount: computed(() => state.notificationCountResource.value() ?? 0)`.
- Add `@bk2/chat-data-access` to `tsconfig.json` references and `package.json` dependencies of `cms-menu-feature`.

**`libs/cms/menu/feature/src/lib/menu.component.ts`**

- Add `protected notificationCount = computed(() => this.menuStore.notificationCount())`.
- Pass `[badge]="notificationCount()"` to `<bk-multi-avatar>` in the `navigate`, `browse`, and `call` cases.

### Behaviour

- Non-dashboard menu items emit `0` immediately — no network calls, no badge rendered.
- The dashboard menu item reactively updates whenever Matrix rooms update or Firestore task data changes.
- Badge colour: `danger` (red), consistent with the per-room badges in the messages section.

---

## Out of scope

- No changes to `MenuItemModel` (no schema change).
- No changes to `AppStore`.
- No new library created.
- `OptionalCardHeaderComponent` badge is not wired up for the messages section (unread counts are already shown per-room).

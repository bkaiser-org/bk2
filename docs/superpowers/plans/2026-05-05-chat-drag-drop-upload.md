# Chat Drag & Drop File Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to drag & drop multiple files onto the main chat message list (and the thread panel) to upload and send them in parallel.

**Architecture:** All changes are confined to `matrix-chat.ts`. Two `signal<boolean>` values track drag-over state for the main column and the thread panel independently. Drop handlers extract `DataTransfer.files`, call `store.sendFile()` for every file in parallel via `Promise.allSettled`, and show a toast if any fail.

**Tech Stack:** Angular signals, native `DragEvent` API, `Promise.allSettled`, existing `store.sendFile(file, threadId?)`, `showToast` from `@bk2/shared-util-angular`.

---

### Task 1: Add drag & drop signals, styles, template bindings, and handlers

**Files:**
- Modify: `libs/chat/feature/src/lib/matrix-chat.ts`

> No unit-testable pure functions are introduced — this is DOM event handling on an existing component. Manual testing steps are provided at the end.

- [ ] **Step 1: Add drag-over signals**

In the "Local state" signals block (after `showRoomList`), add:

```ts
protected isDragOver = signal(false);
protected isThreadDragOver = signal(false);
```

- [ ] **Step 2: Add CSS for the drop overlay and relative-positioned containers**

Append to the `styles` array in the `@Component` decorator (after the `.thread-empty` rule):

```css
.messages-column {
  position: relative;   /* anchor for absolute drop-overlay */
}

.thread-panel {
  position: relative;   /* anchor for absolute drop-overlay */
}

.drop-overlay {
  position: absolute;
  inset: 0;
  background: rgba(var(--ion-color-primary-rgb, 56, 128, 255), 0.12);
  border: 2px dashed var(--ion-color-primary, #3880ff);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  z-index: 20;
  pointer-events: none;
  color: var(--ion-color-primary, #3880ff);
  font-size: 1rem;
  font-weight: 600;
}
```

- [ ] **Step 3: Add drag event bindings and overlay to `.messages-column`**

Replace the opening tag of `.messages-column`:

```html
<div class="messages-column"
  (click)="onMessagesColumnClicked()"
  (dragover)="onDragOver($event)"
  (dragleave)="onDragLeave($event)"
  (drop)="onDrop($event)"
>
```

Insert the overlay as the **first child** of `.messages-column` (before `@if (currentRoom())`):

```html
@if(isDragOver()) {
  <div class="drop-overlay">
    <ion-icon src="{{'upload' | svgIcon}}"></ion-icon>
    <span>Dateien hierher ziehen</span>
  </div>
}
```

- [ ] **Step 4: Add drag event bindings and overlay to `.thread-panel`**

Replace the opening tag of `.thread-panel`:

```html
<div class="thread-panel"
  [class.collapsed]="!selectedThreadId()"
  (dragover)="onThreadDragOver($event)"
  (dragleave)="onThreadDragLeave($event)"
  (drop)="onThreadDrop($event)"
>
```

Insert the overlay as the **first child** of `.thread-panel` (before `<ion-header class="room-header">`):

```html
@if(isThreadDragOver()) {
  <div class="drop-overlay">
    <ion-icon src="{{'upload' | svgIcon}}"></ion-icon>
    <span>Dateien hierher ziehen</span>
  </div>
}
```

- [ ] **Step 5: Add event handler methods to the class**

Add these methods in the "Event handlers" section (e.g. after `onCancelReply()`):

```ts
protected onDragOver(event: DragEvent): void {
  event.preventDefault();
  this.isDragOver.set(true);
}

protected onDragLeave(event: DragEvent): void {
  const host = event.currentTarget as HTMLElement;
  if (!host.contains(event.relatedTarget as Node | null)) {
    this.isDragOver.set(false);
  }
}

protected async onDrop(event: DragEvent): Promise<void> {
  event.preventDefault();
  this.isDragOver.set(false);
  const files = Array.from(event.dataTransfer?.files ?? []);
  if (!files.length) return;
  const results = await Promise.allSettled(files.map(f => this.store.sendFile(f)));
  const failures = results.filter(r => r.status === 'rejected').length;
  if (failures > 0) {
    await showToast(this.toastController, `${failures} Datei(en) konnten nicht gesendet werden`);
  }
}

protected onThreadDragOver(event: DragEvent): void {
  if (!this.selectedThreadId()) return;
  event.preventDefault();
  this.isThreadDragOver.set(true);
}

protected onThreadDragLeave(event: DragEvent): void {
  const host = event.currentTarget as HTMLElement;
  if (!host.contains(event.relatedTarget as Node | null)) {
    this.isThreadDragOver.set(false);
  }
}

protected async onThreadDrop(event: DragEvent): Promise<void> {
  event.preventDefault();
  this.isThreadDragOver.set(false);
  const threadId = this.selectedThreadId();
  if (!threadId) return;
  const files = Array.from(event.dataTransfer?.files ?? []);
  if (!files.length) return;
  const results = await Promise.allSettled(files.map(f => this.store.sendFile(f, threadId)));
  const failures = results.filter(r => r.status === 'rejected').length;
  if (failures > 0) {
    await showToast(this.toastController, `${failures} Datei(en) konnten nicht gesendet werden`);
  }
}
```

- [ ] **Step 6: Type-check**

```bash
npx tsc --noEmit -p libs/chat/feature/tsconfig.json
```

Expected: no output (clean).

- [ ] **Step 7: Manual smoke test**

1. `pnpm nx serve scs-app` and open the chat view
2. Open a room, drag a single image file over the message list → blue dashed overlay appears
3. Drop it → overlay disappears, file message appears in the chat
4. Drag two files simultaneously → both appear as separate messages
5. Open a thread, drag a file over the thread panel → overlay appears, drop sends into thread
6. Drag a file over the collapsed thread panel (no thread open) → no overlay, `dragover` default is not prevented (page does not navigate)

- [ ] **Step 8: Commit**

```bash
git add libs/chat/feature/src/lib/matrix-chat.ts
git commit -m "feat(chat): drag & drop multiple files onto message list and thread panel"
```

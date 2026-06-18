# Chat Image Thumbnails Design

**Date:** 2026-05-07
**Status:** Approved

## Overview

When one or more images are dragged or selected into the chat composer, they are queued with thumbnail previews before sending. After sending, consecutive image events from the same sender within 5 seconds are rendered as a single bubble with a flex-wrap thumbnail grid. Clicking any thumbnail opens a fullscreen lightbox with back/forward navigation and a download button.

---

## 1. File queuing (composer)

**Signal:** `pendingImages = signal<File[]>([])` added to `matrix-chat.ts`.

**Entry points:**

- **Drag-drop** (`onDrop`): image files (`file.type.startsWith('image/')`) are pushed into `pendingImages`; non-image files continue to call `store.sendFile()` immediately.
- **File picker** in `MatrixMessageInput`: the `image/*` picker path queues to `pendingImages` via a new `(fileQueued)` output instead of `fileSent`. The existing non-image picker still emits `fileSent` for immediate send.

**Input component changes (`matrix-message-input.ts`):**

- New `pendingImages = input<File[]>([])` — driven by parent.
- Thumbnail strip rendered above the text field when `pendingImages().length > 0`: 52×52px thumbnails using `URL.createObjectURL`, each with a ✕ remove button.
- New `(removeImage) = output<number>()` — emits the index to remove; parent splices from the signal.
- New `(filesSent) = output<File[]>()` — emitted on send button click when `pendingImages().length > 0`; carries the full array. Parent calls `Promise.allSettled(files.map(f => store.sendFile(f)))`.
- The existing `(fileSent) = output<File>()` is kept for non-image files and audio recordings.

**Send behaviour:** clicking send with both pending text and pending images sends the text message and all images (each as a separate Matrix `m.image` event). Object URLs are revoked after send.

---

## 2. Message list grouping

**Grouping pass:** before rendering, `MatrixMessageList` processes the `messages` input through a `groupMessages()` pure function that returns `(MatrixMessage | ImageBatchGroup)[]`.

**`ImageBatchGroup` interface:**

```ts
interface ImageBatchGroup {
  kind: 'image-batch';
  messages: MatrixMessage[];   // one entry per image
  sender: string;
  senderName: string;
  senderAvatar: string | undefined;
  timestamp: number;           // timestamp of last image in group
}
```

**Grouping rules:**

- Message type is `m.image`, or `m.file` with `content.info.mimetype` starting with `image/`.
- Same `sender` as previous grouped image.
- `timestamp` within 5000 ms of the previous image's timestamp.

**Rendering:**

- Batch bubble: flex-wrap grid of 72×72px `<img>` thumbnails using `message.mediaUrl`.
- Footer: `"N images · HH:MM"`.
- Clicking a thumbnail emits `imageClicked` with `{ message: MatrixMessage; group: MatrixMessage[] }`. The `group` is the full batch array (single-element for standalone images).
- A batch of one image renders identically to a batch of many — consistent code path.
- Own-message bubble uses right-aligned layout matching existing single-image style.

---

## 3. Lightbox

**New component:** `ImageLightboxModal` — standalone Ionic modal in `libs/chat/ui/src/lib/image-lightbox.modal.ts`.

**`componentProps`:**

```ts
{
  images: { mediaUrl: string; filename: string }[];
  initialIndex: number;
}
```

**Internal state:** `currentIndex = signal<number>(initialIndex)`.

**Layout:**

- `IonHeader` toolbar: back chevron (`[disabled]="currentIndex() === 0"`), forward chevron (`[disabled]="currentIndex() === images.length - 1"`), filename label, Download button, Close button.
- `IonContent`: image centered and scaled to fit (`max-width: 100%; max-height: 100%; object-fit: contain`).

**Download:** calls `downloadToBrowser(images[currentIndex()].mediaUrl)`.

**Back/forward:** visible only when `images.length > 1`; update `currentIndex`.

**Caller (`matrix-chat.ts`):**

- `onImageClicked(event)`: receives `{ message: MatrixMessage; group: MatrixMessage[] }` from the message list.
- Builds the `images` array from `group.map(m => ({ mediaUrl: m.mediaUrl!, filename: m.body }))`.
- Passes `initialIndex` as the index of the clicked message within the group.
- Replaces the current `downloadToBrowser` call.

---

## 4. Affected files

| File | Change |
|------|--------|
| `libs/chat/feature/src/lib/matrix-chat.ts` | `pendingImages` signal; `onDrop` image queuing; `onImageClicked` opens lightbox; `onFilesSent` handler |
| `libs/chat/ui/src/lib/matrix-message-input.ts` | `pendingImages` input; thumbnail strip; `removeImage` + `filesSent` + `fileQueued` outputs |
| `libs/chat/ui/src/lib/matrix-message-list.ts` | `groupMessages()` function; `ImageBatchGroup` interface; grid rendering; updated `imageClicked` output type |
| `libs/chat/ui/src/lib/image-lightbox.modal.ts` | **New** — lightbox modal |

No changes to `matrix-chat.service.ts`, `matrix-chat.store.ts`, or any model files.

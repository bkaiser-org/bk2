# News Section Thumbnail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a thumbnail of the first image at the start of each news list row when the article has images.

**Architecture:** Single template + imports change in `NewsSectionComponent`. The existing `ThumbnailUrlPipe` (used by `album-section`) handles imgix URL construction; `IonThumbnail` (Ionic standalone) provides the thumbnail slot. No store, model, or service changes needed.

**Tech Stack:** Angular 20 standalone components, Ionic `IonThumbnail`, `ThumbnailUrlPipe` from `@bk2/shared-pipes`.

---

## File Map

| Action | Path | What changes |
|--------|------|-------------|
| Modify | `libs/cms/section/feature/src/lib/news-section.component.ts` | Add `IonThumbnail` + `ThumbnailUrlPipe` to imports; add conditional thumbnail in `@for` loop |

---

## Task 1: Add thumbnail to news list rows

**Files:**
- Modify: `libs/cms/section/feature/src/lib/news-section.component.ts`

- [ ] **Step 1: Add `IonThumbnail` and `ThumbnailUrlPipe` to the component imports**

In the `@Component` decorator, update the `imports` array from:

```typescript
  imports: [
    OptionalCardHeaderComponent, SpinnerComponent, EmptyListComponent,
    IonCard, IonCardContent, MoreButton, IonList, IonItem, IonLabel
  ],
```

To:

```typescript
  imports: [
    OptionalCardHeaderComponent, SpinnerComponent, EmptyListComponent,
    IonCard, IonCardContent, MoreButton, IonList, IonItem, IonLabel, IonThumbnail,
    ThumbnailUrlPipe,
  ],
```

Also add the two missing TypeScript imports at the top of the file (after the existing `@ionic/angular/standalone` import and after the `@bk2/shared-pipes` import — add the pipe import if the line doesn't exist yet):

```typescript
import { IonCard, IonCardContent, IonItem, IonLabel, IonList, IonThumbnail } from '@ionic/angular/standalone';
```

and

```typescript
import { ThumbnailUrlPipe } from '@bk2/shared-pipes';
```

- [ ] **Step 2: Add the conditional thumbnail inside the `@for` loop**

Find the `ion-item` in the `@for` loop (currently lines 39–47):

```html
              @for (article of news(); track article.bkey) {
                <ion-item (click)="navigateToArticle(article)">
                  <ion-label>
                    @if (article.subTitle) {
                      <p class="subtitle">{{ article.subTitle }}</p>
                    }
                    <p class="title">{{ article.title }}</p>
                    <div class="excerpt" [innerHTML]="articleExcerpt(article)"></div>
                  </ion-label>
                </ion-item>
              }
```

Replace with:

```html
              @for (article of news(); track article.bkey) {
                <ion-item (click)="navigateToArticle(article)">
                  @if(article.properties?.images?.[0]?.url; as imgUrl) {
                    <ion-thumbnail slot="start">
                      <img [src]="imgUrl | thumbnailUrl"
                           [alt]="article.properties.images[0].altText || article.title" />
                    </ion-thumbnail>
                  }
                  <ion-label>
                    @if (article.subTitle) {
                      <p class="subtitle">{{ article.subTitle }}</p>
                    }
                    <p class="title">{{ article.title }}</p>
                    <div class="excerpt" [innerHTML]="articleExcerpt(article)"></div>
                  </ion-label>
                </ion-item>
              }
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit -p libs/cms/section/feature/tsconfig.json
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add libs/cms/section/feature/src/lib/news-section.component.ts
git commit -m "feat(news-section): show first image thumbnail in news list rows"
```

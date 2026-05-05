# News Section Thumbnail Design

**Date:** 2026-05-05
**Status:** Approved

## Overview

When a news article has images, show a thumbnail of the first image at the start of the news list row. Articles without images look unchanged.

## Scope

Single file: `libs/cms/section/feature/src/lib/news-section.component.ts`

No store changes, no model changes, no new components.

## Implementation

**Imports to add:**
- `IonThumbnail` from `@ionic/angular/standalone`
- `ThumbnailUrlPipe` from `@bk2/shared-pipes`

**Template change:**

Inside the `@for (article of news(); ...)` loop, add a conditional `ion-thumbnail` immediately before the existing `ion-label`, using `slot="start"`:

```html
@if(article.properties?.images?.[0]?.url; as imgUrl) {
  <ion-thumbnail slot="start">
    <img [src]="imgUrl | thumbnailUrl"
         [alt]="article.properties.images[0].altText || article.title" />
  </ion-thumbnail>
}
```

## Data source

- `article.properties` is `ArticleConfig` which has `images: ImageConfig[]`
- `ImageConfig.url` is a Firebase storage path or imgix URL
- `ThumbnailUrlPipe` calls `getImgixThumbnailUrl(url, imgixBaseUrl)` — same pipe used by `album-section.component.ts`

## Behaviour

- Thumbnail renders only when `article.properties.images[0].url` is non-empty
- Alt text uses `altText` field if present, falls back to article title
- No thumbnail slot rendered for articles with no images — existing layout unchanged

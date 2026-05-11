# Design: SCS Website Integration

**Date:** 2026-05-11  
**Status:** Approved  
**Scope:** Integrate the static Seeclub Stäfa public website with the scs-app webapp via a public REST API and a shared content model.

---

## 1. Overview

The Seeclub Stäfa public website (`apps/20260511scs_website_v1/seeclub-site/`) is a static HTML/Tailwind site. The goal is to:

1. **Host** it at `seeclub.org/public/` alongside the existing Angular webapp (which stays at root).
2. **Power its dynamic sections** (news, calendar, org info, editable texts) via a new Cloud Function public API at `seeclub.org/public/api/v1`.
3. **Allow contentAdmins** to edit website texts (hero, about, boathouse, contact info) through a new AoC panel in the webapp, stored in a new Firestore collection.
4. **Add i18n support** to `ArticleSection` so bilingual (de/en) news articles can be authored in the webapp CMS.

The static HTML files preserve their Tailwind-based visual identity. The webapp (Angular/Ionic) continues unchanged at root. The two apps share a single Firebase project and single Hosting site.

---

## 2. File Structure

### Rename / move the static site

```
apps/scs-website/           ← renamed from apps/20260511scs_website_v1/seeclub-site/
  index.html                ← landing page; deployed to /public/
  bootshaus.html            ← deployed to /public/bootshaus
  kontakt.html              ← deployed to /public/kontakt
  news-artikel.html         ← deployed to /public/news-artikel (query: ?slug=)
  assets/
    styles.css
    api.js                  ← baseUrl updated to real Cloud Function URL
    shared.js
    bootshaus-neubau.png
    hero-sunset.jpg
```

The `news.html` and `termine.html` static pages are **dropped** — the website links to the existing Angular routes `/public/news` and `/public/calendar` instead.

### Deploy step

Before `firebase deploy --only hosting:scs-app-54aef`, copy `apps/scs-website/` into `dist/apps/scs-app/browser/public/`:

```sh
cp -r apps/scs-website/* dist/apps/scs-app/browser/public/
```

Add this to a `predeploy` hook in `firebase.json` or to the deploy npm script.

---

## 3. Firebase Hosting Configuration

Update `firebase.json` for the `scs-app-54aef` site. Add rewrites **before** the catch-all:

```json
"rewrites": [
  { "source": "/public/api/**",       "function": "publicApi",           "region": "europe-west6" },
  { "source": "/public/bootshaus",    "destination": "/public/bootshaus.html" },
  { "source": "/public/kontakt",      "destination": "/public/kontakt.html"   },
  { "source": "/public/news-artikel", "destination": "/public/news-artikel.html" },
  { "source": "/public",              "destination": "/public/index.html" },
  { "source": "/**",                  "destination": "/index.html" }
]
```

The Angular app continues to serve:
- `/public/news` → `PageDispatcher` (existing route)
- `/public/calendar` → `CalEventListComponent` (existing route)
- `/public/:id` → `PageDispatcher` (existing catch-all)

**CSP update:** Add `cdn.tailwindcss.com` and `fonts.googleapis.com` (already present) to the `script-src` and `style-src` headers in `firebase.json`.

---

## 4. Public API — new Cloud Function module

### Module location

```
apps/functions/src/publicApi/
  index.ts            ← Express app exported as `publicApi` Cloud Function
  routes/
    org.ts            ← GET  /org
    content.ts        ← GET  /content
    news.ts           ← GET  /news,  GET /news/:slug
    calendar.ts       ← GET  /calendar
    courses.ts        ← GET  /courses   (stub, returns [])
    results.ts        ← GET  /results   (stub, returns [])
    contact.ts        ← POST /contact
```

Register in `apps/functions/src/main.ts` alongside existing exports.

### Express router (`index.ts`)

```ts
import express from 'express';
import cors from 'cors';
import { onRequest } from 'firebase-functions/v2/https';

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

app.get('/public/api/v1/org',           orgRouter);
app.get('/public/api/v1/content',       contentRouter);
app.get('/public/api/v1/news',          newsRouter);
app.get('/public/api/v1/news/:slug',    newsSlugRouter);
app.get('/public/api/v1/calendar',      calendarRouter);
app.get('/public/api/v1/courses',       coursesRouter);
app.get('/public/api/v1/results',       resultsRouter);
app.post('/public/api/v1/contact',      contactRouter);

export const publicApi = onRequest({ region: 'europe-west6' }, app);
```

All GET routes set: `Cache-Control: public, max-age=300, stale-while-revalidate=600`.  
`POST /contact` is not cached and has rate-limiting (5 req/IP/min via a simple in-memory counter or Firebase App Check).

### Route: `GET /org`

Reads the first document from `orgs` collection for `tenantId` (query param, required).  
Also reads `websiteContent` keys prefixed with `org.` and merges them into the response. Returns the schema defined in `API.md`.

### Route: `GET /content`

Query params: `tenantId` (required).  
Reads all documents from `websiteContent` where `tenants` contains `tenantId`.  
Returns:

```json
{
  "de": { "hero.title": "Seeclub Stäfa", "hero.lead": "...", "about.p1": "...", ... },
  "en": { "hero.title": "Seeclub Stäfa", "hero.lead": "...", "about.p1": "...", ... }
}
```

The website's `api.js` calls `/content` at startup and merges the result over its JS i18n defaults:

```js
window.scsPageInit = async () => {
  const content = await SCS_API.content();
  if (content) {
    Object.assign(scs.i18n.de, content.de);
    Object.assign(scs.i18n.en, content.en);
    scs.applyLang(scs.lang);
  }
  // … then load events, news, etc.
};
```

### Route: `GET /news`

Query params: `tenantId` (required), `limit` (default 50), `tag` (optional).  
Reads the `news` page from `pages` collection, then fetches all `sections` of `type='article'` that are not archived.  
Maps each `ArticleSection` to the news summary schema:

| Section field | API field |
|---|---|
| `name` | `slug` |
| `title` (I18nString) | `title` |
| `subTitle` (I18nString) | `subTitle` |
| `content.excerpt` (new field, see §5) | `excerpt` |
| `properties.images[0]` | `coverImage` |
| `tags` (comma-split) | `tags[]` |
| `notes` (JSON: `{author: {name, role}}`) | `author` |

### Route: `GET /news/:slug`

Same as above but fetches a single section by `name === slug`. Adds `content.htmlContent` (I18nString) → `content` in response.

### Route: `GET /calendar`

Query params: `tenantId`, `from` (default: today), `to`, `category`, `limit` (default 100).  
Adapts the existing `getPublicCalEvents` logic. Maps `CalEventDoc` to the API calendar schema:

| CalEvent field | API field |
|---|---|
| `bkey` | `id` |
| `startDate` | `date` |
| `startTime` | `time` |
| `name` | `topic.de` (single lang for now; see §5) |
| `locationKey` (name part before `@`) | `location` |
| `type` | `category` |
| `description` | `description.de` |
| `url` | `url` |

### Route: `POST /contact`

Delegates to the existing `srv/contact.ts` email-sending logic.  
Validates: `name` (2–100), `email`, `subject` (enum), `message` (10–5000), honeypot must be empty.  
Returns `202 { status: "accepted", reference: "<msgId>" }` on success.

### Route stubs

`GET /courses` and `GET /results` return `[]` and `200`. Documented as "not yet implemented" in `API.md`.

---

## 5. Content Model Changes

### 5a. New type: `I18nString`

Add to `libs/shared/models/src/lib/base.model.ts` (or a new `i18n.model.ts`):

```ts
export type I18nString = Record<string, string>; // e.g. { de: 'Text', en: 'Text' }
```

### 5b. Extend `ArticleSection` for i18n

**This is the only schema change in this release. `BaseSection` is not changed.**

Add fields to `ArticleConfig` in `section.model.ts`:

```ts
export interface ArticleConfig {
  images: ImageConfig[];
  imageStyle: ImageStyle;
  // i18n extensions (all optional; absent = use BaseSection.title/subTitle/content)
  titleI18n?: I18nString;     // { de: '...', en: '...' } — overrides BaseSection.title
  subTitleI18n?: I18nString;  // overrides BaseSection.subTitle
  excerptI18n?: I18nString;   // short summary shown in news list
  contentI18n?: I18nString;   // full HTML body per language; replaces content.htmlContent
}
```

**Rationale:** `BaseSection.title` and `content.htmlContent` remain `string` for backward compatibility with all other section types (100+ existing sections in Firestore). Only `ArticleSection` gets bilingual fields. The API prefers `titleI18n` over `title`; if absent it falls back to `{de: title}`.

**Migration:** No automated migration needed for existing articles. Editors add `titleI18n` / `contentI18n` when translating; existing German-only articles continue to work.

### 5c. New Firestore collection: `websiteContent`

```ts
interface WebsiteContentModel {
  bkey: string;          // Firestore document ID
  tenants: string[];     // tenant isolation
  key: string;           // i18n key, e.g. 'hero.title', 'about.p1'
  isHtml: boolean;       // whether the content is HTML (uses HtmlEditor) or plain text
  de: string;            // German value
  en: string;            // English value
  // extendable: add 'fr', 'it', etc. as needed
}
```

Pre-populated keys (extracted from `index.html` `data-i18n` attributes):

```
hero.kicker, hero.title, hero.subtitle, hero.lead, hero.cta1, hero.cta2
about.kicker, about.title, about.p1, about.p2, about.stat1-4
offers.kicker, offers.title, offers.lead
offers.course.title/desc, offers.youth.title/desc, offers.competitive.title/desc, offers.lateral.title/desc
boathouse.kicker, boathouse.title, boathouse.lead, boathouse.cta, boathouse.caption
```

The model lives alongside other models in `libs/shared/models/src/lib/website-content.model.ts`.

---

## 6. Content Admin UI

### New AoC section: Website Content

- **Route:** `aoc/website` → `AocWebsiteContent` component (added to `libs/aoc-feature`)
- **List view:** table of all `websiteContent` documents for the current tenant, columns: `key`, `de` (truncated), `en` (truncated), `isHtml` chip
- **Edit modal:** `WebsiteContentEditModal` with:
  - Read-only `key` field
  - `isHtml` toggle
  - `de` field: `HtmlEditor` (when `isHtml=true`) or plain `ion-input`
  - `en` field: same
- **Guard:** `isPrivilegedGuard`

The `WebsiteContentModel` is read/written via `FirestoreService` as with all other models. No new data-access lib is needed — it can live in the existing `aoc-feature` lib.

### Article editor bilingual fields

The existing `section-edit.modal.ts` (in `cms-section-feature`) gains two new optional HtmlEditor fields for `titleI18n.en` and `contentI18n.en` (and `excerptI18n.en`) when `section.type === 'article'`. German fields continue to use the existing `title` and `content.htmlContent` inputs.

---

## 7. Website `api.js` Update

The `baseUrl` in `apps/scs-website/assets/api.js` changes from the stub to the live Cloud Function:

```js
baseUrl: 'https://europe-west6-bkaiser-org.cloudfunctions.net/publicApi',
```

A `tenantId` query parameter (`scs`) is appended to all GET calls. All links to `news.html` / `termine.html` in the website HTML are updated to `/public/news` and `/public/calendar`.

---

## 8. Out of Scope

- Courses data model and `/courses` endpoint implementation
- Competition results model and `/results` endpoint implementation  
- Rate limiting beyond honeypot (App Check integration deferred)
- Full migration of `BaseSection.title` / `content.htmlContent` to `I18nString` across all section types
- Calendar event names and descriptions as `I18nString` (CalEvent model change deferred)
- Website preview / live-edit mode within the Angular app
- SEO sitemap generation
- Image CDN / optimization for website assets

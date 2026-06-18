# SCS Website Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate the static Seeclub Stäfa website with the scs-app webapp via a new `publicApi` Cloud Function, shared Firestore content, and an AoC editor UI for website texts.

**Architecture:** Static HTML/Tailwind site in `apps/scs-website/` is served at `seeclub.org/public/` by Firebase Hosting; dynamic data (news, calendar, editable texts) is fetched from a new `publicApi` Cloud Function at `/public/api/v1`; contentAdmins edit website texts via a new AoC panel (`aoc/website`) that reads/writes the `websiteContent` Firestore collection.

**Tech Stack:** Angular 20, Firebase Cloud Functions v2 (Express), Firestore Admin SDK, ngx-editor (`bk-editor`), NgRx Signal Store, TypeScript strict.

---

## File Map

### New files
| File | Purpose |
|---|---|
| `libs/shared/models/src/lib/i18n.model.ts` | `I18nString` type |
| `libs/shared/models/src/lib/website-content.model.ts` | `WebsiteContentModel`, collection const |
| `apps/functions/src/publicApi/index.ts` | Express app + `publicApi` CF export |
| `apps/functions/src/publicApi/utils.ts` | Pure mapping helpers (testable) |
| `apps/functions/src/publicApi/utils.spec.ts` | Vitest unit tests for mappers |
| `apps/functions/src/publicApi/routes/org.ts` | `GET /org` |
| `apps/functions/src/publicApi/routes/content.ts` | `GET /content` |
| `apps/functions/src/publicApi/routes/news.ts` | `GET /news`, `GET /news/:slug` |
| `apps/functions/src/publicApi/routes/calendar.ts` | `GET /calendar` |
| `apps/functions/src/publicApi/routes/contact.ts` | `POST /contact` |
| `apps/functions/src/publicApi/routes/stubs.ts` | `GET /courses`, `GET /results` |
| `libs/aoc/feature/src/lib/aoc-website.store.ts` | NgRx Signal Store for websiteContent |
| `libs/aoc/feature/src/lib/aoc-website-edit.modal.ts` | Edit modal for one websiteContent item |
| `libs/aoc/feature/src/lib/aoc-website.ts` | AoC list component |
| `apps/scs-website/` | Static HTML site (git mv from `apps/20260511scs_website_v1/seeclub-site/`) |

### Modified files
| File | Change |
|---|---|
| `libs/shared/models/src/index.ts` | Export new models |
| `libs/shared/models/src/lib/section.model.ts` | Add i18n fields to `ArticleConfig` |
| `apps/functions/src/main.ts` | Export `publicApi` |
| `libs/aoc/feature/src/index.ts` | Export new AoC components |
| `apps/scs-app/src/app/app.routes.ts` | Add `aoc/website` route |
| `apps/scs-website/assets/api.js` | Update `baseUrl`, add `content()` call |
| `apps/scs-website/index.html` | Update links (news.html → /public/news) |
| `apps/scs-website/termine.html` → **delete** | Use Angular route instead |
| `apps/scs-website/news.html` → **delete** | Use Angular route instead |
| `firebase.json` | Add Hosting rewrites for `/public/*` and `publicApi` function |

---

## Task 1: Add `I18nString` type and `WebsiteContentModel`

**Files:**
- Create: `libs/shared/models/src/lib/i18n.model.ts`
- Create: `libs/shared/models/src/lib/website-content.model.ts`
- Modify: `libs/shared/models/src/index.ts`

- [ ] **Step 1: Create `i18n.model.ts`**

```typescript
// libs/shared/models/src/lib/i18n.model.ts
export type I18nString = Record<string, string>;

export function i18nString(de: string, en?: string): I18nString {
  const result: I18nString = { de };
  if (en !== undefined) result['en'] = en;
  return result;
}

export function resolveI18n(val: I18nString | undefined, lang: string): string {
  if (!val) return '';
  return val[lang] ?? val['de'] ?? '';
}
```

- [ ] **Step 2: Create `website-content.model.ts`**

```typescript
// libs/shared/models/src/lib/website-content.model.ts
import { BkModel } from './base.model';

export class WebsiteContentModel implements BkModel {
  public bkey = '';
  public tenants: string[] = [];
  public isArchived = false;
  public key = '';         // i18n key, e.g. 'hero.title'
  public de = '';          // German value (plain text or HTML)
  public en = '';          // English value
  public isHtml = false;   // true → render with bk-editor, false → ion-input
}

export const WebsiteContentCollection = 'websiteContent';
export const WebsiteContentModelName = 'websiteContent';
```

- [ ] **Step 3: Export from shared-models index**

In `libs/shared/models/src/index.ts`, add:
```typescript
export * from './lib/i18n.model';
export * from './lib/website-content.model';
```

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit -p libs/shared/models/tsconfig.json
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add libs/shared/models/src/lib/i18n.model.ts \
        libs/shared/models/src/lib/website-content.model.ts \
        libs/shared/models/src/index.ts
git commit -m "feat(models): add I18nString type and WebsiteContentModel"
```

---

## Task 2: Extend `ArticleConfig` with i18n and date fields

**Files:**
- Modify: `libs/shared/models/src/lib/section.model.ts`

- [ ] **Step 1: Add fields to `ArticleConfig`**

Find the `ArticleConfig` interface (around line 153) and replace it:

```typescript
// Before:
export interface ArticleConfig {
    images: ImageConfig[];
    imageStyle: ImageStyle;
}

// After:
export interface ArticleConfig {
  images: ImageConfig[];
  imageStyle: ImageStyle;
  // i18n fields — optional; absent means fall back to BaseSection.title / content.htmlContent
  titleI18n?: I18nString;     // { de: 'Text', en: 'Text' }
  subTitleI18n?: I18nString;
  excerptI18n?: I18nString;   // short summary shown in news list
  contentI18n?: I18nString;   // full HTML body per language
  datePublished?: string;     // storeDate format yyyyMMdd, used to sort news
}
```

Add the import at the top of `section.model.ts`:
```typescript
import { I18nString } from './i18n.model';
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit -p libs/shared/models/tsconfig.json
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add libs/shared/models/src/lib/section.model.ts
git commit -m "feat(models): add i18n and datePublished fields to ArticleConfig"
```

---

## Task 3: Move static site to `apps/scs-website/`

**Files:**
- Move: `apps/20260511scs_website_v1/seeclub-site/` → `apps/scs-website/`
- Delete: `apps/scs-website/news.html` and `apps/scs-website/termine.html` (replaced by Angular routes)

- [ ] **Step 1: Git-move the directory**

```bash
git mv apps/20260511scs_website_v1/seeclub-site apps/scs-website
```

- [ ] **Step 2: Remove pages now served by Angular**

```bash
rm apps/scs-website/news.html apps/scs-website/termine.html
```

- [ ] **Step 3: Delete old prototype directory**

```bash
git rm -r apps/20260511scs_website_v1
```

- [ ] **Step 4: Verify the move**

```bash
ls apps/scs-website/
```
Expected output includes: `index.html  bootshaus.html  kontakt.html  news-artikel.html  assets/`

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: move static website to apps/scs-website, drop replaced pages"
```

---

## Task 4: Update Firebase Hosting and add deploy script

**Files:**
- Modify: `firebase.json`
- Modify: `package.json` (root, add predeploy script)

- [ ] **Step 1: Update the `scs-app-54aef` hosting rewrites in `firebase.json`**

Find the `"site": "scs-app-54aef"` block. Replace the `"rewrites"` array:

```json
"rewrites": [
  {
    "source": "/public/api/**",
    "function": "publicApi",
    "region": "europe-west6"
  },
  {
    "source": "/public/bootshaus",
    "destination": "/public/bootshaus.html"
  },
  {
    "source": "/public/kontakt",
    "destination": "/public/kontakt.html"
  },
  {
    "source": "/public/news-artikel",
    "destination": "/public/news-artikel.html"
  },
  {
    "source": "/public",
    "destination": "/public/index.html"
  },
  {
    "source": "/**",
    "destination": "/index.html"
  }
]
```

- [ ] **Step 2: Add `cdn.tailwindcss.com` to `script-src` in the CSP header**

In the `"source": "**"` header entry, update `script-src` to include `https://cdn.tailwindcss.com`:

```
script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://cdn.tailwindcss.com https://www.gstatic.com ...
```

- [ ] **Step 3: Add deploy copy script to root `package.json`**

Add a `predeploy:website` script that copies the static site into the Angular build output before hosting deploy. Find the `"scripts"` section in the root `package.json` and add:

```json
"copy:website": "mkdir -p dist/apps/scs-app/browser/public && cp -r apps/scs-website/* dist/apps/scs-app/browser/public/"
```

- [ ] **Step 4: Commit**

```bash
git add firebase.json package.json
git commit -m "chore: configure Firebase Hosting rewrites for scs-website at /public/*"
```

---

## Task 5: Scaffold `publicApi` Cloud Function

**Files:**
- Create: `apps/functions/src/publicApi/index.ts`
- Create: `apps/functions/src/publicApi/utils.ts`
- Create: `apps/functions/src/publicApi/utils.spec.ts`
- Modify: `apps/functions/src/main.ts`

- [ ] **Step 1: Create `publicApi/index.ts`**

```typescript
// apps/functions/src/publicApi/index.ts
import express from 'express';
import { onRequest } from 'firebase-functions/v2/https';
import corsLib from 'cors';

import { orgRouter } from './routes/org';
import { contentRouter } from './routes/content';
import { newsRouter } from './routes/news';
import { calendarRouter } from './routes/calendar';
import { contactRouter } from './routes/contact';
import { coursesRouter, resultsRouter } from './routes/stubs';

const cors = corsLib({ origin: true });

const app = express();
app.use((req, res, next) => cors(req, res, next));
app.use(express.json());

const BASE = '/public/api/v1';
app.get(`${BASE}/org`,           orgRouter);
app.get(`${BASE}/content`,       contentRouter);
app.get(`${BASE}/news`,          newsRouter);
app.get(`${BASE}/news/:slug`,    newsRouter);
app.get(`${BASE}/calendar`,      calendarRouter);
app.get(`${BASE}/courses`,       coursesRouter);
app.get(`${BASE}/results`,       resultsRouter);
app.post(`${BASE}/contact`,      contactRouter);

export const publicApi = onRequest({ region: 'europe-west6' }, app);
```

- [ ] **Step 2: Create `publicApi/utils.ts`**

```typescript
// apps/functions/src/publicApi/utils.ts
import { I18nString } from '@bk2/shared-models';

/** Convert storeDate yyyyMMdd → ISO YYYY-MM-DD. Returns '' if invalid. */
export function storeDateToIso(storeDate: string): string {
  if (!storeDate || storeDate.length !== 8) return '';
  return `${storeDate.slice(0, 4)}-${storeDate.slice(4, 6)}-${storeDate.slice(6, 8)}`;
}

/** Extract name part from 'name@key' locationKey. */
export function locationName(locationKey: string): string {
  if (!locationKey) return '';
  const at = locationKey.lastIndexOf('@');
  return at > 0 ? locationKey.slice(0, at) : locationKey;
}

/** Split comma-separated tags string → string[]. Filters empty strings. */
export function parseTags(tags: string): string[] {
  if (!tags) return [];
  return tags.split(',').map(t => t.trim()).filter(Boolean);
}

/** Map CalEvent type to API category enum. */
export function mapCategory(type: string): string {
  const map: Record<string, string> = {
    regatta: 'regatta', club: 'club', course: 'course', training: 'training',
  };
  return map[type] ?? type;
}

/** Resolve I18nString for a given lang, falling back to 'de'. */
export function resolveI18n(val: I18nString | undefined, lang: string): string {
  if (!val) return '';
  return val[lang] ?? val['de'] ?? '';
}

/** Build an I18nString from BaseSection title (German only). */
export function titleToI18n(title: string, titleI18n?: I18nString): I18nString {
  if (titleI18n && Object.keys(titleI18n).length > 0) return titleI18n;
  return { de: title ?? '' };
}

/** Set standard GET cache headers on a response. */
export function setCacheHeaders(res: import('express').Response): void {
  res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');
}
```

- [ ] **Step 3: Write failing tests for utils**

```typescript
// apps/functions/src/publicApi/utils.spec.ts
import { describe, it, expect } from 'vitest';
import {
  storeDateToIso, locationName, parseTags, mapCategory, titleToI18n
} from './utils';

describe('storeDateToIso', () => {
  it('converts valid storeDate', () => {
    expect(storeDateToIso('20260521')).toBe('2026-05-21');
  });
  it('returns empty string for empty input', () => {
    expect(storeDateToIso('')).toBe('');
  });
  it('returns empty string for wrong length', () => {
    expect(storeDateToIso('2026052')).toBe('');
  });
});

describe('locationName', () => {
  it('extracts name before @', () => {
    expect(locationName('Bootshaus Stäfa@abc123')).toBe('Bootshaus Stäfa');
  });
  it('returns input if no @', () => {
    expect(locationName('Bootshaus')).toBe('Bootshaus');
  });
  it('returns empty string for empty input', () => {
    expect(locationName('')).toBe('');
  });
});

describe('parseTags', () => {
  it('splits comma-separated tags', () => {
    expect(parseTags('regatta,erfolg')).toEqual(['regatta', 'erfolg']);
  });
  it('trims whitespace', () => {
    expect(parseTags('regatta, erfolg ')).toEqual(['regatta', 'erfolg']);
  });
  it('returns [] for empty string', () => {
    expect(parseTags('')).toEqual([]);
  });
});

describe('titleToI18n', () => {
  it('returns titleI18n when present', () => {
    expect(titleToI18n('DE', { de: 'DE', en: 'EN' })).toEqual({ de: 'DE', en: 'EN' });
  });
  it('wraps plain title in de key when titleI18n is absent', () => {
    expect(titleToI18n('Hallo')).toEqual({ de: 'Hallo' });
  });
  it('wraps when titleI18n is empty object', () => {
    expect(titleToI18n('Hallo', {})).toEqual({ de: 'Hallo' });
  });
});

describe('mapCategory', () => {
  it('passes through known types', () => {
    expect(mapCategory('regatta')).toBe('regatta');
  });
  it('passes through unknown types as-is', () => {
    expect(mapCategory('social')).toBe('social');
  });
});
```

- [ ] **Step 4: Run tests to confirm they fail (utils not imported yet)**

```bash
pnpm run test functions
```
Expected: 0 tests found or import errors (utils.ts doesn't exist yet). Confirm the test file is picked up.

After confirming the test file is picked up, run again:
```bash
pnpm run test functions
```
Expected: all 10 assertions pass (utils.ts was created in step 2).

- [ ] **Step 5: Export `publicApi` from `main.ts`**

Add at the end of `apps/functions/src/main.ts`:
```typescript
import * as PublicApi from './publicApi';
export const publicApi = PublicApi.publicApi;
```

- [ ] **Step 6: Type-check functions**

```bash
npx tsc --noEmit -p apps/functions/tsconfig.json
```
Expected: errors about missing route files (org.ts, content.ts, etc.) — this is expected; they will be created in subsequent tasks.

- [ ] **Step 7: Commit**

```bash
git add apps/functions/src/publicApi/ apps/functions/src/main.ts
git commit -m "feat(functions): scaffold publicApi Cloud Function with utils + tests"
```

---

## Task 6: Implement `/content` and `/org` routes

**Files:**
- Create: `apps/functions/src/publicApi/routes/content.ts`
- Create: `apps/functions/src/publicApi/routes/org.ts`

- [ ] **Step 1: Create `routes/content.ts`**

```typescript
// apps/functions/src/publicApi/routes/content.ts
import { Request, Response } from 'express';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { setCacheHeaders } from '../utils';

interface WebsiteContentDoc {
  key: string;
  de: string;
  en: string;
  tenants: string[];
  isArchived: boolean;
}

export async function contentRouter(req: Request, res: Response): Promise<void> {
  const tenantId = (req.query['tenantId'] as string)?.trim();
  if (!tenantId) {
    res.status(400).json({ error: { code: 'validation_error', message: 'Missing tenantId' } });
    return;
  }

  try {
    const db = getFirestore();
    const snap = await db.collection('websiteContent')
      .where('tenants', 'array-contains', tenantId)
      .where('isArchived', '==', false)
      .get();

    const result: { de: Record<string, string>; en: Record<string, string> } = { de: {}, en: {} };
    for (const doc of snap.docs) {
      const d = doc.data() as WebsiteContentDoc;
      if (d.de) result.de[d.key] = d.de;
      if (d.en) result.en[d.key] = d.en;
    }

    setCacheHeaders(res);
    res.json(result);
  } catch (err) {
    logger.error('publicApi /content error', { tenantId, err });
    res.status(500).json({ error: { code: 'internal_error', message: 'Failed to fetch content' } });
  }
}
```

- [ ] **Step 2: Create `routes/org.ts`**

```typescript
// apps/functions/src/publicApi/routes/org.ts
import { Request, Response } from 'express';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { setCacheHeaders } from '../utils';

export async function orgRouter(req: Request, res: Response): Promise<void> {
  const tenantId = (req.query['tenantId'] as string)?.trim();
  if (!tenantId) {
    res.status(400).json({ error: { code: 'validation_error', message: 'Missing tenantId' } });
    return;
  }

  try {
    const db = getFirestore();

    // Fetch the primary org for this tenant
    const orgSnap = await db.collection('orgs')
      .where('tenants', 'array-contains', tenantId)
      .where('isArchived', '==', false)
      .limit(1)
      .get();

    const org = orgSnap.empty ? null : orgSnap.docs[0].data();

    // Overlay dynamic website content for any org.* keys
    const contentSnap = await db.collection('websiteContent')
      .where('tenants', 'array-contains', tenantId)
      .where('isArchived', '==', false)
      .get();

    const content: Record<string, { de: string; en: string }> = {};
    for (const doc of contentSnap.docs) {
      const d = doc.data();
      if ((d['key'] as string).startsWith('org.')) {
        content[d['key'] as string] = { de: d['de'] ?? '', en: d['en'] ?? '' };
      }
    }

    setCacheHeaders(res);
    res.json({
      name: org?.['name'] ?? content['org.name']?.de ?? '',
      shortName: org?.['shortName'] ?? content['org.shortName']?.de ?? '',
      tagline: content['org.tagline'] ?? { de: '', en: '' },
      description: content['org.description'] ?? { de: '', en: '' },
      memberCount: org?.['memberCount'] ?? 0,
      address: {
        street: org?.['favStreet'] ?? '',
        postalCode: org?.['favZipCode'] ?? '',
        city: org?.['favCity'] ?? '',
        country: 'CH',
      },
      contact: {
        email: org?.['favEmail'] ?? '',
        phone: org?.['favPhone'] ?? '',
      },
      social: {
        instagram: content['org.instagram']?.de ?? '',
      },
      memberLoginUrl: 'https://seeclub.org/',
      logoUrl: content['org.logoUrl']?.de ?? '',
    });
  } catch (err) {
    logger.error('publicApi /org error', { tenantId, err });
    res.status(500).json({ error: { code: 'internal_error', message: 'Failed to fetch org' } });
  }
}
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit -p apps/functions/tsconfig.json
```
Expected: remaining errors only about missing route files not yet created.

- [ ] **Step 4: Commit**

```bash
git add apps/functions/src/publicApi/routes/
git commit -m "feat(functions/publicApi): implement /content and /org routes"
```

---

## Task 7: Implement `/news` and `/news/:slug` routes

**Files:**
- Create: `apps/functions/src/publicApi/routes/news.ts`

The `news` page in Firestore has `bkey='news'`. Its `sections` field is an array of section `bkey` strings. The route fetches sections directly from the `sections` collection filtered by `type='article'` and `tenants` (avoids N+1 fetches).

- [ ] **Step 1: Create `routes/news.ts`**

```typescript
// apps/functions/src/publicApi/routes/news.ts
import { Request, Response } from 'express';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { setCacheHeaders, parseTags, storeDateToIso, titleToI18n } from '../utils';
import type { I18nString } from '@bk2/shared-models';

interface ArticleSectionDoc {
  bkey: string;
  name: string;       // slug
  title: string;
  subTitle: string;
  tags: string;
  tenants: string[];
  isArchived: boolean;
  type: string;
  content: { htmlContent: string };
  properties?: {
    images?: Array<{ url: string; alt?: string; width?: number; height?: number }>;
    titleI18n?: I18nString;
    subTitleI18n?: I18nString;
    excerptI18n?: I18nString;
    contentI18n?: I18nString;
    datePublished?: string;
  };
}

function sectionToNewsSummary(doc: ArticleSectionDoc) {
  const props = doc.properties ?? {};
  const img = props.images?.[0];
  return {
    slug: doc.name,
    date: storeDateToIso(props.datePublished ?? ''),
    title: titleToI18n(doc.title, props.titleI18n),
    subTitle: titleToI18n(doc.subTitle, props.subTitleI18n),
    excerpt: props.excerptI18n ?? { de: '' },
    coverImage: img ? {
      url: img.url,
      alt: img.alt ? { de: img.alt } : { de: '' },
      width: img.width ?? 0,
      height: img.height ?? 0,
    } : undefined,
    tags: parseTags(doc.tags),
  };
}

function sectionToNewsDetail(doc: ArticleSectionDoc) {
  const props = doc.properties ?? {};
  return {
    ...sectionToNewsSummary(doc),
    content: props.contentI18n ?? { de: doc.content?.htmlContent ?? '' },
  };
}

export async function newsRouter(req: Request, res: Response): Promise<void> {
  const tenantId = (req.query['tenantId'] as string)?.trim();
  if (!tenantId) {
    res.status(400).json({ error: { code: 'validation_error', message: 'Missing tenantId' } });
    return;
  }

  const slug = req.params['slug'];

  try {
    const db = getFirestore();

    if (slug) {
      // GET /news/:slug
      const snap = await db.collection('sections')
        .where('name', '==', slug)
        .where('type', '==', 'article')
        .where('tenants', 'array-contains', tenantId)
        .where('isArchived', '==', false)
        .limit(1)
        .get();

      if (snap.empty) {
        res.status(404).json({ error: { code: 'not_found', message: 'Article not found', details: { slug } } });
        return;
      }

      const doc = { bkey: snap.docs[0].id, ...snap.docs[0].data() } as ArticleSectionDoc;
      setCacheHeaders(res);
      res.json(sectionToNewsDetail(doc));
      return;
    }

    // GET /news
    const limitParam = parseInt(req.query['limit'] as string ?? '50', 10);
    const limit = isNaN(limitParam) || limitParam < 1 ? 50 : Math.min(limitParam, 200);
    const tag = (req.query['tag'] as string)?.trim();

    const snap = await db.collection('sections')
      .where('type', '==', 'article')
      .where('tenants', 'array-contains', tenantId)
      .where('isArchived', '==', false)
      .get();

    let docs = snap.docs.map(d => ({ bkey: d.id, ...d.data() } as ArticleSectionDoc));

    if (tag) {
      docs = docs.filter(d => parseTags(d.tags).includes(tag));
    }

    // Sort descending by datePublished
    docs.sort((a, b) => {
      const dateA = a.properties?.datePublished ?? '';
      const dateB = b.properties?.datePublished ?? '';
      return dateB.localeCompare(dateA);
    });

    setCacheHeaders(res);
    res.json(docs.slice(0, limit).map(sectionToNewsSummary));
  } catch (err) {
    logger.error('publicApi /news error', { tenantId, slug, err });
    res.status(500).json({ error: { code: 'internal_error', message: 'Failed to fetch news' } });
  }
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit -p apps/functions/tsconfig.json
```

- [ ] **Step 3: Commit**

```bash
git add apps/functions/src/publicApi/routes/news.ts
git commit -m "feat(functions/publicApi): implement /news and /news/:slug routes"
```

---

## Task 8: Implement `/calendar` route

**Files:**
- Create: `apps/functions/src/publicApi/routes/calendar.ts`

- [ ] **Step 1: Create `routes/calendar.ts`**

```typescript
// apps/functions/src/publicApi/routes/calendar.ts
import { Request, Response } from 'express';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { setCacheHeaders, storeDateToIso, locationName, mapCategory } from '../utils';

interface CalEventDoc {
  bkey: string;
  name: string;
  description: string;
  startDate: string;   // yyyyMMdd
  startTime: string;   // HH:mm
  type: string;
  locationKey: string;
  url: string;
  isArchived: boolean;
  calendars: string[];
  tenants: string[];
}

function docToApiEvent(doc: CalEventDoc) {
  return {
    id: doc.bkey,
    date: storeDateToIso(doc.startDate),
    time: doc.startTime || undefined,
    topic: { de: doc.name },
    location: locationName(doc.locationKey) || undefined,
    category: mapCategory(doc.type),
    description: doc.description ? { de: doc.description } : undefined,
    url: doc.url || undefined,
  };
}

export async function calendarRouter(req: Request, res: Response): Promise<void> {
  const tenantId = (req.query['tenantId'] as string)?.trim();
  if (!tenantId) {
    res.status(400).json({ error: { code: 'validation_error', message: 'Missing tenantId' } });
    return;
  }

  const from = (req.query['from'] as string)?.replace(/-/g, '') || todayStoreDate();
  const to   = (req.query['to']   as string)?.replace(/-/g, '') || '';
  const category = (req.query['category'] as string)?.trim();
  const limitParam = parseInt(req.query['limit'] as string ?? '100', 10);
  const limit = isNaN(limitParam) || limitParam < 1 ? 100 : Math.min(limitParam, 500);

  try {
    const db = getFirestore();
    const snap = await db.collection('calevents')
      .where('calendars', 'array-contains', 'public')
      .where('isArchived', '==', false)
      .get();

    let docs = snap.docs
      .filter(d => {
        const data = d.data();
        return Array.isArray(data['tenants']) && (data['tenants'] as string[]).includes(tenantId);
      })
      .map(d => ({ bkey: d.id, ...d.data() } as CalEventDoc));

    // Apply date range filter
    docs = docs.filter(d => {
      if (d.startDate < from) return false;
      if (to && d.startDate > to) return false;
      return true;
    });

    // Apply category filter
    if (category) {
      docs = docs.filter(d => mapCategory(d.type) === category);
    }

    // Sort ascending by date then time
    docs.sort((a, b) => {
      const cmp = a.startDate.localeCompare(b.startDate);
      return cmp !== 0 ? cmp : a.startTime.localeCompare(b.startTime);
    });

    setCacheHeaders(res);
    res.json(docs.slice(0, limit).map(docToApiEvent));
  } catch (err) {
    logger.error('publicApi /calendar error', { tenantId, err });
    res.status(500).json({ error: { code: 'internal_error', message: 'Failed to fetch calendar' } });
  }
}

function todayStoreDate(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit -p apps/functions/tsconfig.json
```

- [ ] **Step 3: Commit**

```bash
git add apps/functions/src/publicApi/routes/calendar.ts
git commit -m "feat(functions/publicApi): implement /calendar route"
```

---

## Task 9: Implement `/contact` route

**Files:**
- Create: `apps/functions/src/publicApi/routes/contact.ts`

- [ ] **Step 1: Create `routes/contact.ts`**

```typescript
// apps/functions/src/publicApi/routes/contact.ts
import { Request, Response } from 'express';
import { logger } from 'firebase-functions/v2';
import { sendEmailViaProvider } from '../../auth/email-transport';

const VALID_SUBJECTS = ['general', 'course', 'lateral', 'youth', 'boathouse'] as const;
type Subject = typeof VALID_SUBJECTS[number];

interface ContactRequest {
  name: string;
  email: string;
  phone?: string;
  subject: Subject;
  message: string;
  language?: 'de' | 'en';
  honeypot?: string;
  captchaToken?: string;
}

export function validateContact(body: Partial<ContactRequest>): string | null {
  if (!body.name || body.name.length < 2 || body.name.length > 100) return 'name must be 2-100 chars';
  if (!body.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) return 'invalid email';
  if (!body.subject || !VALID_SUBJECTS.includes(body.subject as Subject)) return 'invalid subject';
  if (!body.message || body.message.length < 10 || body.message.length > 5000) return 'message must be 10-5000 chars';
  if (body.honeypot) return 'spam detected';
  return null;
}

export async function contactRouter(req: Request, res: Response): Promise<void> {
  const body = req.body as Partial<ContactRequest>;

  const validationError = validateContact(body);
  if (validationError) {
    res.status(400).json({ error: { code: 'validation_error', message: validationError } });
    return;
  }

  const toEmail = process.env['CONTACT_EMAIL'] ?? 'info@seeclub.org';
  const reference = `msg_${Date.now().toString(36)}`;

  try {
    await sendEmailViaProvider('mailgun_smtp', {
      from: `Website Kontakt <noreply@mail.seeclub.org>`,
      to: [toEmail],
      subject: `Kontaktanfrage: ${body.subject} (${body.name})`,
      html: `
        <p><strong>Name:</strong> ${body.name}</p>
        <p><strong>E-Mail:</strong> ${body.email}</p>
        ${body.phone ? `<p><strong>Telefon:</strong> ${body.phone}</p>` : ''}
        <p><strong>Betreff:</strong> ${body.subject}</p>
        <p><strong>Nachricht:</strong></p>
        <p>${body.message.replace(/\n/g, '<br>')}</p>
        <p><em>Referenz: ${reference}</em></p>
      `,
    });

    logger.info('publicApi /contact: email sent', { reference, subject: body.subject });
    res.status(202).json({ status: 'accepted', reference });
  } catch (err) {
    logger.error('publicApi /contact: email failed', { err });
    res.status(500).json({ error: { code: 'internal_error', message: 'Failed to send message' } });
  }
}
```

- [ ] **Step 2: Add `validateContact` unit test to `utils.spec.ts`**

Add this block to `apps/functions/src/publicApi/utils.spec.ts`:

```typescript
// At the top, add import:
// import { validateContact } from './routes/contact';

// Add describe block:
describe('validateContact', () => {
  const valid = {
    name: 'Anna Muster', email: 'anna@example.com',
    subject: 'general' as const, message: 'Ich habe eine Frage an euch.',
    honeypot: '',
  };

  it('returns null for valid input', () => {
    const { validateContact } = require('./routes/contact');
    expect(validateContact(valid)).toBeNull();
  });
  it('rejects short name', () => {
    const { validateContact } = require('./routes/contact');
    expect(validateContact({ ...valid, name: 'X' })).toMatch(/name/);
  });
  it('rejects invalid email', () => {
    const { validateContact } = require('./routes/contact');
    expect(validateContact({ ...valid, email: 'notanemail' })).toMatch(/email/);
  });
  it('rejects invalid subject', () => {
    const { validateContact } = require('./routes/contact');
    expect(validateContact({ ...valid, subject: 'hack' as any })).toMatch(/subject/);
  });
  it('rejects non-empty honeypot', () => {
    const { validateContact } = require('./routes/contact');
    expect(validateContact({ ...valid, honeypot: 'bot' })).toMatch(/spam/);
  });
});
```

- [ ] **Step 3: Run tests**

```bash
pnpm run test functions
```
Expected: all tests pass including the new `validateContact` suite.

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit -p apps/functions/tsconfig.json
```

- [ ] **Step 5: Commit**

```bash
git add apps/functions/src/publicApi/routes/contact.ts \
        apps/functions/src/publicApi/utils.spec.ts
git commit -m "feat(functions/publicApi): implement /contact route with validation tests"
```

---

## Task 10: Add `/courses` and `/results` stubs + final type-check

**Files:**
- Create: `apps/functions/src/publicApi/routes/stubs.ts`

- [ ] **Step 1: Create `routes/stubs.ts`**

```typescript
// apps/functions/src/publicApi/routes/stubs.ts
import { Request, Response } from 'express';
import { setCacheHeaders } from '../utils';

export function coursesRouter(_req: Request, res: Response): void {
  setCacheHeaders(res);
  res.json([]);
}

export function resultsRouter(_req: Request, res: Response): void {
  setCacheHeaders(res);
  res.json([]);
}
```

- [ ] **Step 2: Full type-check of functions**

```bash
npx tsc --noEmit -p apps/functions/tsconfig.json
```
Expected: **no errors**.

- [ ] **Step 3: Run full test suite**

```bash
pnpm run test functions
```
Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add apps/functions/src/publicApi/routes/stubs.ts
git commit -m "feat(functions/publicApi): add stub routes for /courses and /results"
```

---

## Task 11: Update website `api.js` and HTML links

**Files:**
- Modify: `apps/scs-website/assets/api.js`
- Modify: `apps/scs-website/index.html`
- Modify: `apps/scs-website/bootshaus.html`
- Modify: `apps/scs-website/kontakt.html`
- Modify: `apps/scs-website/news-artikel.html`

- [ ] **Step 1: Update `baseUrl` and add `content()` in `api.js`**

In `apps/scs-website/assets/api.js`, change:

```javascript
// Before:
const SCS_API = {
  baseUrl: 'https://seeclub.org/public/api/v1',
```

```javascript
// After:
const SCS_TENANT = 'scs';

const SCS_API = {
  baseUrl: 'https://europe-west6-bkaiser-org.cloudfunctions.net/publicApi/public/api/v1',
```

Add the `content()` method right after `_get(path)`:
```javascript
  async content() {
    return (await this._get(`/content?tenantId=${SCS_TENANT}`)) || null;
  },
```

Update all existing methods to append `?tenantId=${SCS_TENANT}` (or `&tenantId=...` where query params already exist):
```javascript
  async org()           { return (await this._get(`/org?tenantId=${SCS_TENANT}`))       || SCS_FALLBACK.org; },
  async news(params)    {
    const q = new URLSearchParams({ tenantId: SCS_TENANT, ...(params || {}) }).toString();
    return (await this._get('/news?' + q)) || SCS_FALLBACK.news;
  },
  async newsBySlug(slug){ return (await this._get(`/news/${encodeURIComponent(slug)}?tenantId=${SCS_TENANT}`))
                              || SCS_FALLBACK.news.find(n => n.slug === slug) || null; },
  async calendar(params){
    const q = new URLSearchParams({ tenantId: SCS_TENANT, ...(params || {}) }).toString();
    return (await this._get('/calendar?' + q)) || SCS_FALLBACK.calendar;
  },
  async courses()       { return (await this._get(`/courses?tenantId=${SCS_TENANT}`))   || SCS_FALLBACK.courses; },
  async results(params) {
    const q = new URLSearchParams({ tenantId: SCS_TENANT, ...(params || {}) }).toString();
    return (await this._get('/results?' + q))   || SCS_FALLBACK.results;
  },
```

- [ ] **Step 2: Load content at startup in `index.html`**

In `apps/scs-website/index.html`, update the `scsPageInit` function to call `/content` first:

```javascript
// Find the existing scsPageInit and replace with:
window.scsPageInit = async () => {
  const content = await SCS_API.content();
  if (content) {
    Object.assign(scs.i18n.de, content.de || {});
    Object.assign(scs.i18n.en, content.en || {});
    scs.applyLang(scs.lang);
  }
  _events = await SCS_API.calendar();
  _news = await SCS_API.news();
  renderEventsHome(_events);
  renderNewsHome(_news);
};
```

- [ ] **Step 3: Update internal links in all HTML files**

In `apps/scs-website/index.html`:
- Replace `href="news.html"` → `href="/public/news"`
- Replace `href="termine.html"` → `href="/public/calendar"`

In `apps/scs-website/bootshaus.html`:
- Replace `href="index.html"` (or `href="../"`) → `href="/public"`
- Replace `href="news.html"` → `href="/public/news"`
- Replace `href="termine.html"` → `href="/public/calendar"`

In `apps/scs-website/kontakt.html`:
- Same link replacements as above

In `apps/scs-website/news-artikel.html`:
- Replace `href="news.html"` → `href="/public/news"`
- Replace `href="index.html"` → `href="/public"`

- [ ] **Step 4: Commit**

```bash
git add apps/scs-website/
git commit -m "feat(website): wire api.js to live CF, load /content at startup, fix links"
```

---

## Task 12: Implement `AocWebsiteStore`

**Files:**
- Create: `libs/aoc/feature/src/lib/aoc-website.store.ts`

- [ ] **Step 1: Create the store**

```typescript
// libs/aoc/feature/src/lib/aoc-website.store.ts
import { computed, inject } from '@angular/core';
import { AlertController, ModalController } from '@ionic/angular/standalone';
import { rxResource } from '@angular/core/rxjs-interop';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { of } from 'rxjs';

import { FirestoreService } from '@bk2/shared-data-access';
import { AppStore } from '@bk2/shared-feature';
import { WebsiteContentCollection, WebsiteContentModel } from '@bk2/shared-models';
import { getSystemQuery } from '@bk2/shared-util-core';
import { bkPrompt } from '@bk2/shared-util-angular';

export type AocWebsiteState = {
  searchTerm: string;
};

export const AocWebsiteStore = signalStore(
  withState<AocWebsiteState>({ searchTerm: '' }),
  withProps(() => ({
    appStore: inject(AppStore),
    firestoreService: inject(FirestoreService),
    alertController: inject(AlertController),
    modalController: inject(ModalController),
  })),
  withProps(store => ({
    contentResource: rxResource({
      params: () => ({
        fbUser: store.appStore.fbUser(),
        tenantId: store.appStore.env.tenantId,
      }),
      stream: ({ params }) => {
        if (!params.fbUser || !params.tenantId) return of([] as WebsiteContentModel[]);
        return store.firestoreService.searchData<WebsiteContentModel>(
          WebsiteContentCollection,
          getSystemQuery(params.tenantId),
          'key',
          'asc',
        );
      },
    }),
  })),
  withComputed(store => ({
    isLoading: computed(() => store.contentResource.isLoading()),
    allItems: computed(() => (store.contentResource.value() ?? []) as WebsiteContentModel[]),
    filteredItems: computed(() => {
      const term = store.searchTerm().toLowerCase().trim();
      const all = (store.contentResource.value() ?? []) as WebsiteContentModel[];
      return term
        ? all.filter(item => item.key.toLowerCase().includes(term) || item.de.toLowerCase().includes(term))
        : all;
    }),
  })),
  withMethods(store => ({
    setSearchTerm(term: string) {
      patchState(store, { searchTerm: term });
    },

    async createItem(): Promise<void> {
      const key = await bkPrompt(store.alertController, '@aoc.website.key.prompt', '');
      if (!key) return;
      const item: WebsiteContentModel = {
        bkey: '',
        tenants: [store.appStore.env.tenantId],
        isArchived: false,
        key: key.trim(),
        de: '',
        en: '',
        isHtml: false,
      };
      await store.firestoreService.createModel<WebsiteContentModel>(
        WebsiteContentCollection, item, '@aoc.website.operation.create', store.appStore.currentUser(),
      );
    },

    async saveItem(item: WebsiteContentModel): Promise<void> {
      await store.firestoreService.updateModel<WebsiteContentModel>(
        WebsiteContentCollection, item, false, '@aoc.website.operation.update', store.appStore.currentUser(),
      );
    },

    async deleteItem(item: WebsiteContentModel): Promise<void> {
      await store.firestoreService.deleteModel<WebsiteContentModel>(
        WebsiteContentCollection, item, '@aoc.website.operation.delete', store.appStore.currentUser(),
      );
    },
  })),
);
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit -p libs/aoc/feature/tsconfig.json
```
Expected: no errors (or only errors from missing modal imported in step 13).

- [ ] **Step 3: Commit**

```bash
git add libs/aoc/feature/src/lib/aoc-website.store.ts
git commit -m "feat(aoc): add AocWebsiteStore for websiteContent management"
```

---

## Task 13: Implement `AocWebsiteEditModal`

**Files:**
- Create: `libs/aoc/feature/src/lib/aoc-website-edit.modal.ts`

- [ ] **Step 1: Create the edit modal**

```typescript
// libs/aoc/feature/src/lib/aoc-website-edit.modal.ts
// NOTE: Modals run in a separate injector context (overlay outlet) and cannot
// inject a parent component's store. This modal returns modified data via
// modalController.dismiss(); the parent AocWebsite component calls store.saveItem().
import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input, linkedSignal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonButton, IonButtons, IonContent, IonItem, IonInput, IonLabel,
  IonToggle, IonToolbar, ModalController,
} from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { EditorComponent, HeaderComponent } from '@bk2/shared-ui';
import { WebsiteContentModel } from '@bk2/shared-models';
import { deepEqual, safeStructuredClone } from '@bk2/shared-util-core';

@Component({
  selector: 'bk-aoc-website-edit-modal',
  standalone: true,
  imports: [
    AsyncPipe, FormsModule, TranslatePipe,
    HeaderComponent, EditorComponent,
    IonContent, IonToolbar, IonButtons, IonButton,
    IonItem, IonLabel, IonInput, IonToggle,
  ],
  template: `
    <bk-header [title]="'@aoc.website.edit.title' | translate | async" [isModal]="true" />
    <ion-content class="ion-padding">
      <ion-item>
        <ion-label position="stacked">{{ '@aoc.website.key.label' | translate | async }}</ion-label>
        <ion-input [value]="formData().key" [readonly]="true" />
      </ion-item>

      <ion-item>
        <ion-label>{{ '@aoc.website.isHtml.label' | translate | async }}</ion-label>
        <ion-toggle [checked]="formData().isHtml" (ionChange)="onToggleHtml($event)" />
      </ion-item>

      <ion-item lines="none">
        <ion-label>{{ '@lang.de' | translate | async }}</ion-label>
      </ion-item>
      @if (formData().isHtml) {
        <bk-editor [(content)]="deContent" [readOnly]="false" />
      } @else {
        <ion-item>
          <ion-input [value]="formData().de" (ionInput)="onDeInput($event)" />
        </ion-item>
      }

      <ion-item lines="none">
        <ion-label>{{ '@lang.en' | translate | async }}</ion-label>
      </ion-item>
      @if (formData().isHtml) {
        <bk-editor [(content)]="enContent" [readOnly]="false" />
      } @else {
        <ion-item>
          <ion-input [value]="formData().en" (ionInput)="onEnInput($event)" />
        </ion-item>
      }

      <ion-toolbar>
        <ion-buttons slot="end">
          <ion-button (click)="cancel()">{{ '@cancel' | translate | async }}</ion-button>
          <ion-button [disabled]="!isDirty()" (click)="save()" color="primary">
            {{ '@save' | translate | async }}
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-content>
  `,
})
export class AocWebsiteEditModal {
  private readonly modalController = inject(ModalController);

  public item = input.required<WebsiteContentModel>();

  protected formData = linkedSignal(() => safeStructuredClone(this.item()) ?? {} as WebsiteContentModel);
  protected deContent = linkedSignal(() => this.formData().de ?? '');
  protected enContent = linkedSignal(() => this.formData().en ?? '');
  protected isDirty = computed(() => !deepEqual(this.formData(), safeStructuredClone(this.item())));

  protected onToggleHtml(event: Event): void {
    this.formData.update(d => ({ ...d, isHtml: (event as CustomEvent).detail.checked }));
  }

  protected onDeInput(event: Event): void {
    this.formData.update(d => ({ ...d, de: (event as CustomEvent).detail.value ?? '' }));
  }

  protected onEnInput(event: Event): void {
    this.formData.update(d => ({ ...d, en: (event as CustomEvent).detail.value ?? '' }));
  }

  protected async save(): Promise<void> {
    // Merge editor content (may have been updated independently via bk-editor model)
    const data: WebsiteContentModel = { ...this.formData(), de: this.deContent(), en: this.enContent() };
    await this.modalController.dismiss(data, 'confirm');
  }

  protected cancel(): void {
    this.modalController.dismiss(null, 'cancel');
  }
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit -p libs/aoc/feature/tsconfig.json
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add libs/aoc/feature/src/lib/aoc-website-edit.modal.ts
git commit -m "feat(aoc): add AocWebsiteEditModal for editing website content items"
```

---

## Task 14: Implement `AocWebsite` list component and wire routes

**Files:**
- Create: `libs/aoc/feature/src/lib/aoc-website.ts`
- Modify: `libs/aoc/feature/src/index.ts`
- Modify: `apps/scs-app/src/app/app.routes.ts`

- [ ] **Step 1: Create `aoc-website.ts`**

```typescript
// libs/aoc/feature/src/lib/aoc-website.ts
import { AsyncPipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  ActionSheetController, ActionSheetOptions, ModalController,
  IonBadge, IonButton, IonButtons, IonCard, IonCardContent, IonCardHeader,
  IonCardTitle, IonChip, IonCol, IonContent, IonGrid, IonIcon, IonItem,
  IonLabel, IonList, IonRow, IonSearchbar, IonToolbar,
} from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { HeaderComponent } from '@bk2/shared-ui';
import { WebsiteContentModel } from '@bk2/shared-models';
import { createActionSheetButton, createActionSheetOptions } from '@bk2/shared-util-angular';
import { SvgIconPipe } from '@bk2/shared-pipes';

import { AocWebsiteStore } from './aoc-website.store';
import { AocWebsiteEditModal } from './aoc-website-edit.modal';

@Component({
  selector: 'bk-aoc-website',
  standalone: true,
  imports: [
    AsyncPipe, FormsModule, TranslatePipe, SvgIconPipe,
    HeaderComponent,
    IonContent, IonToolbar, IonSearchbar, IonButtons, IonButton, IonIcon,
    IonGrid, IonRow, IonCol, IonCard, IonCardHeader, IonCardTitle, IonCardContent,
    IonList, IonItem, IonLabel, IonBadge, IonChip,
  ],
  providers: [AocWebsiteStore],
  template: `
    <bk-header title="@aoc.website.title" />
    <ion-content>
      <ion-toolbar>
        <ion-searchbar
          [value]="store.searchTerm()"
          [placeholder]="('@search.placeholder' | translate | async) ?? ''"
          (ionInput)="onSearch($event)"
          debounce="300" />
        <ion-buttons slot="end">
          <ion-button (click)="store.createItem()">
            <ion-icon slot="icon-only" src="{{ 'add' | svgIcon }}" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>

      <ion-card>
        <ion-card-header>
          <ion-card-title>
            {{ '@aoc.website.list.title' | translate | async }}
            <ion-badge color="medium">{{ store.filteredItems().length }}</ion-badge>
          </ion-card-title>
        </ion-card-header>
        <ion-card-content>
          @if (store.isLoading()) {
            <ion-item lines="none">
              <ion-label>{{ '@loading' | translate | async }}</ion-label>
            </ion-item>
          }
          <ion-list lines="inset">
            @for (item of store.filteredItems(); track item.bkey) {
              <ion-item (click)="showActions(item)" button>
                <ion-icon slot="start" src="{{ 'globe' | svgIcon }}" />
                <ion-label>
                  <h3>{{ item.key }}</h3>
                  <p>de: {{ item.de | slice:0:60 }}</p>
                </ion-label>
                @if (item.isHtml) {
                  <ion-chip slot="end" color="primary">HTML</ion-chip>
                }
              </ion-item>
            }
          </ion-list>
        </ion-card-content>
      </ion-card>
    </ion-content>
  `,
})
export class AocWebsite {
  protected readonly store = inject(AocWebsiteStore);
  private readonly actionSheetController = inject(ActionSheetController);
  private readonly modalController = inject(ModalController);

  protected onSearch(event: Event): void {
    const value = (event as CustomEvent).detail.value ?? '';
    this.store.setSearchTerm(value);
  }

  protected async showActions(item: WebsiteContentModel): Promise<void> {
    const base = this.store.appStore.env.services.imgixBaseUrl;
    const options: ActionSheetOptions = createActionSheetOptions('@actionsheet.label.choose');
    options.buttons.push(createActionSheetButton('website.edit', base, 'edit'));
    options.buttons.push(createActionSheetButton('website.delete', base, 'trash'));
    options.buttons.push(createActionSheetButton('cancel', base, 'cancel'));

    const sheet = await this.actionSheetController.create(options);
    await sheet.present();
    const { data } = await sheet.onDidDismiss();
    if (!data) return;

    switch (data.action) {
      case 'website.edit':
        await this.openEditModal(item);
        break;
      case 'website.delete':
        await this.store.deleteItem(item);
        break;
    }
  }

  private async openEditModal(item: WebsiteContentModel): Promise<void> {
    const modal = await this.modalController.create({
      component: AocWebsiteEditModal,
      componentProps: { item },
    });
    await modal.present();
    const { data, role } = await modal.onDidDismiss<WebsiteContentModel>();
    if (role === 'confirm' && data) {
      await this.store.saveItem(data);
    }
  }
}
```

- [ ] **Step 2: Export from `libs/aoc/feature/src/index.ts`**

Add:
```typescript
export * from './lib/aoc-website';
export * from './lib/aoc-website-edit.modal';
export * from './lib/aoc-website.store';
```

- [ ] **Step 3: Add route in `apps/scs-app/src/app/app.routes.ts`**

In the `aoc` path children array, add after the last `aoc` child (before the closing `]`):

```typescript
{ path: 'website', canActivate: [isPrivilegedGuard], loadComponent: () => import('@bk2/aoc-feature').then(m => m.AocWebsite) },
```

- [ ] **Step 4: Type-check Angular app**

```bash
npx tsc --noEmit -p apps/scs-app/tsconfig.json
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add libs/aoc/feature/src/ apps/scs-app/src/app/app.routes.ts
git commit -m "feat(aoc): add AocWebsite list component and /aoc/website route"
```

---

## Task 15: Build and smoke-test

- [ ] **Step 1: Run all tests**

```bash
pnpm run testlibs
pnpm run test functions
```
Expected: all pass.

- [ ] **Step 2: Build the Angular app**

```bash
pnpm nx build scs-app
```
Expected: build succeeds, no TypeScript errors.

- [ ] **Step 3: Build Cloud Functions**

```bash
pnpm nx build functions --configuration production
```
Expected: `dist/apps/functions/` created without errors.

- [ ] **Step 4: Copy website files into Angular build output**

```bash
pnpm run copy:website
```
Expected: `dist/apps/scs-app/browser/public/index.html` exists.

- [ ] **Step 5: Deploy to Firebase (functions + hosting)**

```bash
firebase deploy --only functions:publicApi
firebase deploy --only hosting:scs-app-54aef
```
Expected: both deploys succeed.

- [ ] **Step 6: Smoke-test the API**

```bash
# Test /content
curl "https://europe-west6-bkaiser-org.cloudfunctions.net/publicApi/public/api/v1/content?tenantId=scs"
# Expected: JSON with de and en keys

# Test /calendar
curl "https://europe-west6-bkaiser-org.cloudfunctions.net/publicApi/public/api/v1/calendar?tenantId=scs"
# Expected: JSON array of events

# Test /news
curl "https://europe-west6-bkaiser-org.cloudfunctions.net/publicApi/public/api/v1/news?tenantId=scs"
# Expected: JSON array (may be empty if no articles yet)
```

- [ ] **Step 7: Smoke-test the website**

Open `https://seeclub.org/public` in a browser.
Expected: landing page loads with Tailwind styling, events and news sections populated from live API (or show fallback data).

- [ ] **Step 8: Smoke-test AoC website panel**

Log in as a privileged user, navigate to `/aoc/website`.
Expected: the website content list loads (empty if no items seeded yet).

- [ ] **Step 9: Final commit**

```bash
git add -A
git status  # verify no stray files
git commit -m "chore: smoke-test verified, website integration complete"
```

# PDF Generator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a serverless document generator with Handlebars templates, producing PDF/DOCX/HTML from a Cloud Function, plus an Angular admin UI for template management and a reusable `<doc-button>` widget.

**Architecture:** Firebase Cloud Function (Puppeteer + Handlebars, Gen 2, `europe-west6`) handles generation; four Angular libs (`pdf-template-util`, `-data-access`, `-ui`, `-feature`) provide services, a reusable button widget, and a full template admin UI. Templates live in Firestore `templates/{id}/versions/{n}`; generated docs in Cloud Storage `generated-docs/`.

**Tech Stack:** Angular 20 + NgRx Signals + Ionic 8, Firebase (Firestore, Storage, Functions Gen 2), Puppeteer, Handlebars, html-to-docx, Vitest

---

## Prerequisites — new packages (get user approval before Task 2)

| Package | Where | Why |
|---------|-------|-----|
| `puppeteer` | `apps/functions` | Headless Chrome for PDF rendering |
| `handlebars` + `@types/handlebars` | `apps/functions` | Template engine |
| `html-to-docx` | `apps/functions` | DOCX output format |

Angular PDF preview is iframe-based (no extra package). Monaco editor deferred to v2 (textarea used).

---

## File Map

**Backend — Cloud Function:**
| File | Responsibility |
|------|----------------|
| `libs/shared/models/src/lib/pdf-template.model.ts` | `TemplateModel`, `TemplateVersionModel`, `DocGenerationModel`, collection names, types |
| `apps/functions/src/pdf/index.ts` | Export `generateDocument` |
| `apps/functions/src/pdf/generate-document.ts` | Main CF: auth check, rate limit, template load, render, output |
| `apps/functions/src/pdf/handlebars-helpers.ts` | `formatMoney`, `formatDate`, `formatIban`, `formatReference`, `ifEquals`, arithmetic |
| `apps/functions/src/pdf/browser-pool.ts` | Singleton Puppeteer browser per Function instance |
| `apps/functions/src/pdf/template-cache.ts` | Map-based LRU cache for compiled Handlebars templates |
| `apps/functions/src/pdf/asset-resolver.ts` | Resolve `AssetReference[]` to signed-URL map (50-min cache) |
| `apps/functions/src/pdf/rate-limiter.ts` | Firestore-backed per-user rate limiting |
| `apps/functions/src/pdf/sanitize.ts` | Strip external `<script>` tags from HTML |
| `apps/functions/src/main.ts` | **MODIFY**: export `generateDocument` |
| `apps/functions/package.json` | **MODIFY**: add puppeteer, handlebars, html-to-docx |
| `libs/shared/models/src/index.ts` | **MODIFY**: export pdf-template models |
| `firestore.rules` | **MODIFY**: add `templates`, `templates/versions`, `docGenerations` rules |

**Angular — Data Layer:**
| File | Responsibility |
|------|----------------|
| `libs/pdf-template/util/src/lib/pdf-template.util.ts` | `newTemplate()`, `newTemplateVersion()`, `getTemplateIndex()` |
| `libs/pdf-template/util/src/lib/pdf-template.util.spec.ts` | Unit tests for util functions |
| `libs/pdf-template/util/src/index.ts` | Re-exports |
| `libs/pdf-template/util/tsconfig.json` | `noEmit: true`, Angular compiler options |
| `libs/pdf-template/util/tsconfig.lib.json` | `outDir`, composite build |
| `libs/pdf-template/util/package.json` | `@bk2/pdf-template-util` |
| `libs/pdf-template/util/vite.config.ts` | Vitest config |
| `libs/pdf-template/data-access/src/lib/scope.ts` | `PFX` constant |
| `libs/pdf-template/data-access/src/lib/template.service.ts` | Firestore CRUD + version subcollection |
| `libs/pdf-template/data-access/src/lib/doc-generation.service.ts` | Angular callable wrapper for `generateDocument` |
| `libs/pdf-template/data-access/src/index.ts` | Re-exports |
| `libs/pdf-template/data-access/tsconfig.json` | noEmit: true |
| `libs/pdf-template/data-access/tsconfig.lib.json` | composite build |
| `libs/pdf-template/data-access/package.json` | `@bk2/pdf-template-data-access` |
| `tsconfig.base.json` | **MODIFY**: add `@bk2/pdf-template-*` aliases |

**Angular — UI + Feature:**
| File | Responsibility |
|------|----------------|
| `libs/pdf-template/ui/src/lib/doc-button.ts` | `<doc-button>` standalone component |
| `libs/pdf-template/ui/src/lib/pdf-preview.modal.ts` | PDF preview modal (iframe) |
| `libs/pdf-template/ui/src/index.ts` | Re-exports |
| `libs/pdf-template/ui/tsconfig.json` | noEmit: true |
| `libs/pdf-template/ui/tsconfig.lib.json` | composite build |
| `libs/pdf-template/ui/package.json` | `@bk2/pdf-template-ui` |
| `libs/pdf-template/feature/src/lib/scope.ts` | `PFX` constant |
| `libs/pdf-template/feature/src/lib/template.store.ts` | NgRx Signal Store: list, CRUD, version management, preview |
| `libs/pdf-template/feature/src/lib/template-list.ts` | Template list with filter, action sheet per row |
| `libs/pdf-template/feature/src/lib/template-edit.page.ts` | Template editor: metadata/HTML/CSS/preview tabs |
| `libs/pdf-template/feature/src/lib/template-publish.modal.ts` | Publish dialog: changelog input + confirmation |
| `libs/pdf-template/feature/src/index.ts` | Re-exports |
| `libs/pdf-template/feature/tsconfig.json` | noEmit: true |
| `libs/pdf-template/feature/tsconfig.lib.json` | composite build |
| `libs/pdf-template/feature/package.json` | `@bk2/pdf-template-feature` |
| `libs/pdf-template/feature/src/i18n/de.json` | German translations |
| `apps/scs-app/project.json` | **MODIFY**: add i18n asset glob for pdf-template/feature |
| `apps/scs-app/src/app/app.routes.ts` | **MODIFY**: add `/templates` routes |

---

## Task 1: Shared Models

**Files:**
- Create: `libs/shared/models/src/lib/pdf-template.model.ts`
- Modify: `libs/shared/models/src/index.ts`

- [ ] **Step 1: Write the file**

```typescript
// libs/shared/models/src/lib/pdf-template.model.ts

export const TemplateCollection = 'templates';
export const TemplateVersionSubcollection = 'versions';
export const DocGenerationCollection = 'docGenerations';

export type TemplateStatus = 'draft' | 'published' | 'archived';
export type TemplateOutputFormat = 'pdf' | 'docx' | 'html';
export type TemplateCategory = 'invoice' | 'expense' | 'report' | 'dunning' | 'other';
export type TemplateLanguage = 'de' | 'fr' | 'it' | 'en';

export interface TemplateAssetRef {
  key: string;
  storagePath: string;
  mimeType: string;
}

export class TemplateModel {
  public bkey = '';
  public tenants: string[] = [];
  public isArchived = false;
  public index = '';

  public name = '';
  public description = '';
  public category: TemplateCategory = 'other';
  public language: TemplateLanguage = 'de';
  public currentVersion = 0;
  public draftVersion: number | undefined = undefined;
  public status: TemplateStatus = 'draft';
  public defaultOutputFormat: TemplateOutputFormat = 'pdf';
  public defaultFormat = 'A4';
  public defaultOrientation: 'portrait' | 'landscape' = 'portrait';
  public sampleData = '{}';   // JSON string
  public payloadSchema = '';  // JSON schema string (optional)

  public createdAt = '';
  public createdBy = '';
  public updatedAt = '';
  public updatedBy = '';

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export class TemplateVersionModel {
  public bkey = '';  // string representation of version number

  public version = 1;
  public html = '';
  public css = '';
  public partials: Record<string, string> = {};
  public assets: TemplateAssetRef[] = [];
  public status: TemplateStatus = 'draft';
  public changelog = '';
  public publishedAt = '';
  public publishedBy = '';
  public createdAt = '';
  public createdBy = '';
}

export class DocGenerationModel {
  public bkey = '';
  public tenants: string[] = [];
  public isArchived = false;
  public index = '';

  public userId = '';
  public templateId = '';
  public templateVersion = 0;
  public outputFormat: TemplateOutputFormat = 'pdf';
  public status: 'success' | 'failed' = 'success';
  public errorMessage = '';
  public storagePath = '';
  public filename = '';
  public sizeBytes = 0;
  public durationMs = 0;
  public entityType = '';
  public entityId = '';

  public createdAt = '';

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}
```

- [ ] **Step 2: Export from shared/models index**

Open `libs/shared/models/src/index.ts` and add at the end:
```typescript
export * from './lib/pdf-template.model';
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit -p libs/shared/models/tsconfig.json
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add libs/shared/models/src/lib/pdf-template.model.ts libs/shared/models/src/index.ts
git commit -m "feat: add TemplateModel, TemplateVersionModel, DocGenerationModel to shared/models"
```

---

## Task 2: Cloud Function — Install Dependencies

> **STOP**: Run this task manually and get user approval before executing `pnpm` commands.

- [ ] **Step 1: Ask user to approve packages** (list: `puppeteer`, `handlebars`, `@types/handlebars`, `html-to-docx`)

- [ ] **Step 2: Install packages in functions**

```bash
cd apps/functions && pnpm add puppeteer handlebars html-to-docx && pnpm add -D @types/handlebars
```

- [ ] **Step 3: Verify functions package.json lists the new packages**

```bash
grep -E "puppeteer|handlebars|html-to-docx" apps/functions/package.json
```
Expected: three lines, each with a version.

- [ ] **Step 4: Commit**

```bash
git add apps/functions/package.json apps/functions/pnpm-lock.yaml
git commit -m "chore(functions): add puppeteer, handlebars, html-to-docx dependencies"
```

---

## Task 3: Handlebars Helpers + HTML Sanitizer

**Files:**
- Create: `apps/functions/src/pdf/handlebars-helpers.ts`
- Create: `apps/functions/src/pdf/sanitize.ts`

- [ ] **Step 1: Create handlebars-helpers.ts**

```typescript
// apps/functions/src/pdf/handlebars-helpers.ts
import Handlebars from 'handlebars';

export function registerHelpers(): void {
  Handlebars.registerHelper('formatMoney', (amount: unknown, currency = 'CHF') => {
    const num = typeof amount === 'number' ? amount / 100 : parseFloat(String(amount ?? 0)) / 100;
    return new Intl.NumberFormat('de-CH', { style: 'currency', currency: String(currency) }).format(num);
  });

  Handlebars.registerHelper('formatDate', (dateStr: unknown, locale = 'de-CH') => {
    if (!dateStr) return '';
    const date = new Date(String(dateStr));
    if (isNaN(date.getTime())) return String(dateStr);
    return date.toLocaleDateString(String(locale), { day: '2-digit', month: '2-digit', year: 'numeric' });
  });

  Handlebars.registerHelper('formatIban', (iban: unknown) => {
    if (!iban) return '';
    return String(iban).replace(/\s/g, '').replace(/(.{4})/g, '$1 ').trim();
  });

  Handlebars.registerHelper('formatReference', (ref: unknown) => {
    if (!ref) return '';
    return String(ref).replace(/\s/g, '').replace(/(.{5})/g, '$1 ').trim();
  });

  Handlebars.registerHelper('ifEquals', function (
    this: unknown,
    a: unknown,
    b: unknown,
    options: Handlebars.HelperOptions
  ) {
    return a === b ? options.fn(this) : options.inverse(this);
  });

  Handlebars.registerHelper('multiply', (a: unknown, b: unknown) =>
    (Number(a) * Number(b)).toFixed(2)
  );
  Handlebars.registerHelper('add', (a: unknown, b: unknown) => Number(a) + Number(b));
  Handlebars.registerHelper('subtract', (a: unknown, b: unknown) => Number(a) - Number(b));
}
```

- [ ] **Step 2: Create sanitize.ts**

```typescript
// apps/functions/src/pdf/sanitize.ts

/** Remove external <script> tags from untrusted HTML before Puppeteer rendering. */
export function sanitizeHtml(html: string): string {
  return html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script\s*>/gi, '');
}
```

- [ ] **Step 3: Build functions to check for TS errors**

```bash
pnpm nx build functions --configuration production 2>&1 | tail -20
```
Expected: Build succeeds (the helpers aren't imported yet; just validate syntax).

- [ ] **Step 4: Commit**

```bash
git add apps/functions/src/pdf/handlebars-helpers.ts apps/functions/src/pdf/sanitize.ts
git commit -m "feat(functions/pdf): Handlebars helpers and HTML sanitizer"
```

---

## Task 4: Browser Pool + Template Cache

**Files:**
- Create: `apps/functions/src/pdf/browser-pool.ts`
- Create: `apps/functions/src/pdf/template-cache.ts`

- [ ] **Step 1: Create browser-pool.ts**

```typescript
// apps/functions/src/pdf/browser-pool.ts
import puppeteer, { Browser } from 'puppeteer';
import * as logger from 'firebase-functions/logger';

let browser: Browser | null = null;

export async function getBrowser(): Promise<Browser> {
  if (browser?.connected) return browser;
  logger.info('pdf/browser-pool: launching new Puppeteer browser');
  browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  });
  browser.on('disconnected', () => { browser = null; });
  return browser;
}
```

- [ ] **Step 2: Create template-cache.ts**

```typescript
// apps/functions/src/pdf/template-cache.ts
import Handlebars from 'handlebars';

type CompiledTemplate = HandlebarsTemplateDelegate;

const MAX_SIZE = 50;
const cache = new Map<string, CompiledTemplate>();

/** key format: `${templateId}@${version}` */
export function getCachedTemplate(key: string): CompiledTemplate | undefined {
  return cache.get(key);
}

export function setCachedTemplate(key: string, fn: CompiledTemplate): void {
  if (cache.size >= MAX_SIZE) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, fn);
}

export function compileTemplate(key: string, html: string, css?: string): CompiledTemplate {
  const cached = getCachedTemplate(key);
  if (cached) return cached;
  // Inject CSS into HTML before compiling so the template renders with styles
  const fullHtml = css ? html.replace('</head>', `<style>${css}</style></head>`) : html;
  const compiled = Handlebars.compile(fullHtml);
  setCachedTemplate(key, compiled);
  return compiled;
}
```

- [ ] **Step 3: Build check**

```bash
pnpm nx build functions --configuration production 2>&1 | tail -10
```
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add apps/functions/src/pdf/browser-pool.ts apps/functions/src/pdf/template-cache.ts
git commit -m "feat(functions/pdf): Puppeteer browser pool and Handlebars template cache"
```

---

## Task 5: Asset Resolver + Rate Limiter

**Files:**
- Create: `apps/functions/src/pdf/asset-resolver.ts`
- Create: `apps/functions/src/pdf/rate-limiter.ts`

- [ ] **Step 1: Create asset-resolver.ts**

```typescript
// apps/functions/src/pdf/asset-resolver.ts
import { getStorage } from 'firebase-admin/storage';
import type { TemplateAssetRef } from '@bk2/shared-models';

interface CachedUrl { url: string; expires: number; }
const urlCache = new Map<string, CachedUrl>();
const TTL_MS = 50 * 60 * 1000; // 50 minutes

export async function resolveAssetUrls(
  assets: TemplateAssetRef[]
): Promise<Record<string, string>> {
  const resolved: Record<string, string> = {};
  const bucket = getStorage().bucket();
  const now = Date.now();

  for (const asset of assets) {
    const cached = urlCache.get(asset.storagePath);
    if (cached && cached.expires > now) {
      resolved[asset.key] = cached.url;
      continue;
    }
    const [url] = await bucket.file(asset.storagePath).getSignedUrl({
      action: 'read',
      expires: now + TTL_MS,
    });
    urlCache.set(asset.storagePath, { url, expires: now + TTL_MS });
    resolved[asset.key] = url;
  }
  return resolved;
}
```

- [ ] **Step 2: Create rate-limiter.ts**

```typescript
// apps/functions/src/pdf/rate-limiter.ts
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';

const LIMITS = {
  admin: 60_000,        // 1 per minute
  regular: 5 * 60_000, // 1 per 5 minutes
};

/**
 * Throws resource-exhausted if the user has generated too recently.
 * isAdmin is true when the user has admin or contentAdmin custom claim.
 */
export async function checkRateLimit(userId: string, isAdmin: boolean): Promise<void> {
  const db = getFirestore();
  const ref = db.collection('_rateLimits').doc(`docGen_${userId}`);
  const limit = isAdmin ? LIMITS.admin : LIMITS.regular;

  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const now = Date.now();
    if (snap.exists) {
      const lastAt = (snap.data()!['lastAt'] as Timestamp).toMillis();
      const elapsed = now - lastAt;
      if (elapsed < limit) {
        const retryAfter = Math.ceil((limit - elapsed) / 1000);
        throw new HttpsError(
          'resource-exhausted',
          `Rate limit exceeded. Retry after ${retryAfter} seconds.`,
          { retryAfterSeconds: retryAfter }
        );
      }
    }
    tx.set(ref, { lastAt: Timestamp.now(), userId });
  });
}
```

- [ ] **Step 3: Build check**

```bash
pnpm nx build functions --configuration production 2>&1 | tail -10
```
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add apps/functions/src/pdf/asset-resolver.ts apps/functions/src/pdf/rate-limiter.ts
git commit -m "feat(functions/pdf): asset URL resolver and rate limiter"
```

---

## Task 6: Main generateDocument Cloud Function

**Files:**
- Create: `apps/functions/src/pdf/generate-document.ts`
- Create: `apps/functions/src/pdf/index.ts`

- [ ] **Step 1: Create generate-document.ts**

```typescript
// apps/functions/src/pdf/generate-document.ts
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { getStorage } from 'firebase-admin/storage';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import Handlebars from 'handlebars';
// @ts-expect-error html-to-docx lacks type declarations
import HtmlToDocx from 'html-to-docx';

import {
  TemplateCollection,
  TemplateVersionSubcollection,
  DocGenerationCollection,
  TemplateModel,
  TemplateVersionModel,
  DocGenerationModel,
} from '@bk2/shared-models';
import { registerHelpers } from './handlebars-helpers';
import { getBrowser } from './browser-pool';
import { compileTemplate } from './template-cache';
import { resolveAssetUrls } from './asset-resolver';
import { checkRateLimit } from './rate-limiter';
import { sanitizeHtml } from './sanitize';

// Register helpers once at cold-start
registerHelpers();

export interface GenerateDocumentRequest {
  templateId?: string;
  templateVersion?: number;
  payload?: Record<string, unknown>;
  html?: string;
  options?: {
    outputFormat?: 'pdf' | 'docx' | 'html';
    format?: 'A4' | 'A5' | 'Letter';
    orientation?: 'portrait' | 'landscape';
    margin?: { top?: string; bottom?: string; left?: string; right?: string };
    filename?: string;
    storageMode?: 'persist' | 'ephemeral';
    metadata?: { entityType?: string; entityId?: string };
  };
}

export interface GenerateDocumentResponse {
  url: string;
  storagePath: string;
  filename: string;
  sizeBytes: number;
  outputFormat: 'pdf' | 'docx' | 'html';
  generatedAt: string;
  templateVersion?: number;
  generationId: string;
}

export const generateDocument = onCall<GenerateDocumentRequest, Promise<GenerateDocumentResponse>>(
  {
    region: 'europe-west6',
    enforceAppCheck: true,
    memory: '2GiB',
    timeoutSeconds: 120,
    minInstances: 1,
    maxInstances: 10,
    concurrency: 1,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const { templateId, html: rawHtml, payload = {}, options = {} } = request.data;

    if (!templateId && !rawHtml) {
      throw new HttpsError('invalid-argument', 'Provide either templateId or html');
    }
    if (templateId && rawHtml) {
      throw new HttpsError('invalid-argument', 'Provide either templateId or html, not both');
    }

    const userId = request.auth.uid;
    const tenantId: string = (request.auth.token['tenantId'] as string) ?? 'default';
    const isAdmin: boolean =
      request.auth.token['admin'] === true ||
      request.auth.token['contentAdmin'] === true;

    const outputFormat = options.outputFormat ?? 'pdf';
    const storageMode = options.storageMode ?? 'persist';
    const generationId = crypto.randomUUID();
    const startMs = Date.now();

    // Rate limit (skip for ephemeral/preview calls)
    if (storageMode !== 'ephemeral') {
      await checkRateLimit(userId, isAdmin);
    }

    let htmlToRender: string;
    let resolvedVersion: number | undefined;
    let templateName = 'document';

    if (templateId) {
      // — Template mode —
      const db = getFirestore();
      const templateSnap = await db.collection(TemplateCollection).doc(templateId).get();
      if (!templateSnap.exists) {
        throw new HttpsError('not-found', `Template ${templateId} not found`);
      }
      const tmpl = templateSnap.data() as TemplateModel;

      if (tmpl.status === 'archived') {
        throw new HttpsError('failed-precondition', 'Template is archived');
      }
      if (!tmpl.currentVersion && tmpl.status !== 'draft') {
        throw new HttpsError('failed-precondition', 'Template has no published version');
      }

      resolvedVersion = options?.['templateVersion'] ?? tmpl.currentVersion;
      templateName = tmpl.name;

      const versionSnap = await db
        .collection(TemplateCollection)
        .doc(templateId)
        .collection(TemplateVersionSubcollection)
        .doc(String(resolvedVersion))
        .get();

      if (!versionSnap.exists) {
        throw new HttpsError('not-found', `Template version ${resolvedVersion} not found`);
      }
      const version = versionSnap.data() as TemplateVersionModel;

      // Resolve asset signed URLs and register assetUrl helper per-request
      const assetUrls = await resolveAssetUrls(version.assets ?? []);
      Handlebars.registerHelper('assetUrl', (key: string) => assetUrls[key] ?? '');

      // Compile template (cached)
      const cacheKey = `${templateId}@${resolvedVersion}`;
      const compiled = compileTemplate(cacheKey, version.html, version.css);

      // Register partials
      for (const [name, content] of Object.entries(version.partials ?? {})) {
        Handlebars.registerPartial(name, content);
      }

      htmlToRender = compiled(payload);
    } else {
      // — Raw HTML mode —
      htmlToRender = sanitizeHtml(rawHtml!);
    }

    // Generate output
    const ext = outputFormat === 'pdf' ? 'pdf' : outputFormat === 'docx' ? 'docx' : 'html';
    const filename = options.filename ?? `${templateName}-${Date.now()}.${ext}`;
    const tempPath = path.join(os.tmpdir(), `${generationId}.${ext}`);

    try {
      if (outputFormat === 'pdf') {
        const browser = await getBrowser();
        const page = await browser.newPage();
        try {
          await page.setContent(htmlToRender, { waitUntil: 'networkidle0' });
          await page.pdf({
            path: tempPath,
            format: (options.format ?? 'A4') as 'A4' | 'A5' | 'Letter',
            landscape: options.orientation === 'landscape',
            printBackground: true,
            margin: options.margin ?? { top: '15mm', bottom: '15mm', left: '15mm', right: '15mm' },
          });
        } finally {
          await page.close();
        }
      } else if (outputFormat === 'docx') {
        const docxBuffer = await HtmlToDocx(htmlToRender, undefined, {
          table: { row: { cantSplit: true } },
          footer: true,
          pageNumber: true,
        });
        fs.writeFileSync(tempPath, docxBuffer);
      } else {
        // html
        fs.writeFileSync(tempPath, htmlToRender, 'utf8');
      }

      const sizeBytes = fs.statSync(tempPath).size;
      const storagePath = storageMode === 'persist'
        ? `generated-docs/${tenantId}/${userId}/${generationId}.${ext}`
        : `generated-docs-ephemeral/${tenantId}/${generationId}.${ext}`;

      const bucket = getStorage().bucket();
      await bucket.upload(tempPath, {
        destination: storagePath,
        metadata: { contentType: outputFormat === 'pdf' ? 'application/pdf' : outputFormat === 'docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'text/html' },
      });

      const [signedUrl] = await bucket.file(storagePath).getSignedUrl({
        action: 'read',
        expires: Date.now() + 3600_000, // 1 hour
      });

      const durationMs = Date.now() - startMs;

      // Write audit entry (skip for ephemeral)
      if (storageMode === 'persist') {
        const audit: Partial<DocGenerationModel> = {
          bkey: generationId,
          tenants: [tenantId],
          userId,
          templateId: templateId ?? '',
          templateVersion: resolvedVersion ?? 0,
          outputFormat,
          status: 'success',
          storagePath,
          filename,
          sizeBytes,
          durationMs,
          entityType: options.metadata?.entityType ?? '',
          entityId: options.metadata?.entityId ?? '',
          createdAt: new Date().toISOString(),
        };
        await getFirestore().collection(DocGenerationCollection).doc(generationId).set(audit);
      }

      logger.info('generateDocument: success', { generationId, durationMs, outputFormat, sizeBytes });

      return {
        url: signedUrl,
        storagePath,
        filename,
        sizeBytes,
        outputFormat,
        generatedAt: new Date().toISOString(),
        templateVersion: resolvedVersion,
        generationId,
      };

    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('generateDocument: failed', { generationId, message });

      // Write failed audit entry
      if (storageMode === 'persist') {
        await getFirestore().collection(DocGenerationCollection).doc(generationId).set({
          bkey: generationId,
          tenants: [tenantId],
          userId,
          templateId: templateId ?? '',
          outputFormat,
          status: 'failed',
          errorMessage: message,
          durationMs: Date.now() - startMs,
          createdAt: new Date().toISOString(),
        }).catch(() => undefined);
      }

      if (err instanceof HttpsError) throw err;
      throw new HttpsError('internal', message);
    } finally {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    }
  }
);
```

- [ ] **Step 2: Create apps/functions/src/pdf/index.ts**

```typescript
// apps/functions/src/pdf/index.ts
export { generateDocument } from './generate-document';
export type { GenerateDocumentRequest, GenerateDocumentResponse } from './generate-document';
```

- [ ] **Step 3: Build and verify**

```bash
pnpm nx build functions --configuration production 2>&1 | tail -20
```
Expected: Build succeeds with no TypeScript errors. Warnings about `html-to-docx` missing types are acceptable.

- [ ] **Step 4: Commit**

```bash
git add apps/functions/src/pdf/
git commit -m "feat(functions): generateDocument Cloud Function (PDF, DOCX, HTML, raw-HTML mode)"
```

---

## Task 7: Register CF + Firestore Rules

**Files:**
- Modify: `apps/functions/src/main.ts`
- Modify: `firestore.rules`

- [ ] **Step 1: Export generateDocument in main.ts**

In `apps/functions/src/main.ts`, add after the existing imports and before the first export:
```typescript
import * as Pdf from './pdf';
```

Then add at the bottom of the file:
```typescript
// pdf document generation
export const generateDocument = Pdf.generateDocument;
```

- [ ] **Step 2: Add Firestore security rules**

In `firestore.rules`, inside the `match /databases/{database}/documents {` block, add:

```javascript
    match /templates/{templateId} {
      allow read: if request.auth != null
                  && (resource.data.tenants.hasAny([request.auth.token.tenantId])
                      || resource.data.tenants.hasAny(['system']));
      allow create, update: if request.auth != null
                               && (request.auth.token.admin == true
                                   || request.auth.token.contentAdmin == true);
      allow delete: if request.auth != null && request.auth.token.admin == true;

      match /versions/{versionId} {
        allow read: if request.auth != null;
        allow create: if request.auth != null
                         && (request.auth.token.admin == true
                             || request.auth.token.contentAdmin == true);
        allow update: if request.auth != null
                         && (request.auth.token.admin == true
                             || request.auth.token.contentAdmin == true)
                         && resource.data.status == 'draft';
        allow delete: if false;
      }
    }

    match /docGenerations/{genId} {
      allow read: if request.auth != null
                  && (request.auth.uid == resource.data.userId
                      || request.auth.token.admin == true);
      allow write: if false; // only writable by Cloud Function
    }

    match /_rateLimits/{docId} {
      allow read, write: if false; // only writable by Cloud Function
    }
```

- [ ] **Step 3: Build and verify**

```bash
pnpm nx build functions --configuration production 2>&1 | tail -10
```
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add apps/functions/src/main.ts firestore.rules
git commit -m "feat: register generateDocument CF and add Firestore security rules"
```

---

## Task 8: Angular Lib Scaffolding (all 4 libs)

**Files:** All tsconfig/package.json/index.ts/vite.config for util, data-access, ui, feature.

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p libs/pdf-template/util/src/lib
mkdir -p libs/pdf-template/data-access/src/lib
mkdir -p libs/pdf-template/ui/src/lib
mkdir -p libs/pdf-template/feature/src/lib
mkdir -p libs/pdf-template/feature/src/i18n
```

- [ ] **Step 2: Create util lib config files**

`libs/pdf-template/util/tsconfig.json`:
```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true,
    "types": ["node", "vitest"],
    "declaration": true
  },
  "angularCompilerOptions": {
    "strictTemplates": true,
    "strictInjectionParameters": true,
    "fullTemplateTypeCheck": true,
    "disableTypeScriptVersionCheck": true,
    "compileNonExportedClasses": true,
    "skipTemplateCodegen": false
  },
  "include": ["src/**/*", "**/*.spec.ts", "**/*.test.ts"],
  "exclude": ["dist/**/*"],
  "references": [
    { "path": "../../shared/models/tsconfig.lib.json" },
    { "path": "../../shared/util-core/tsconfig.lib.json" }
  ]
}
```

`libs/pdf-template/util/tsconfig.lib.json`:
```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "../../../dist/libs/pdf-template/util",
    "declaration": true,
    "composite": true,
    "module": "es2020",
    "target": "es2020",
    "types": [],
    "tsBuildInfoFile": "../../../dist/out-tsc/pdf-template-util.tsbuildinfo"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["**/*.spec.ts", "**/*.spec2.ts", "**/test-setup.ts", "vite.config.ts"],
  "references": []
}
```

`libs/pdf-template/util/package.json`:
```json
{
  "name": "@bk2/pdf-template-util",
  "version": "0.0.1",
  "main": "./src/index.js",
  "types": "./src/index.d.ts",
  "sideEffects": false,
  "private": true,
  "dependencies": {
    "tslib": "^2.8.1",
    "@bk2/shared-models": "*",
    "@bk2/shared-util-core": "*"
  }
}
```

`libs/pdf-template/util/vite.config.ts`:
```typescript
import { nxCopyAssetsPlugin } from '@nx/vite/plugins/nx-copy-assets.plugin';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { defineConfig, mergeConfig } from 'vite';
import sharedTestConfig from '../../../vitest.shared';

const libraryConfig = defineConfig({
  root: __dirname,
  cacheDir: '../../../node_modules/.vite/libs/pdf-template/util',
  plugins: [nxViteTsPaths(), nxCopyAssetsPlugin(['*.md'])],
  test: {
    coverage: {
      reportsDirectory: '../../../coverage/libs/pdf-template/util',
      provider: 'v8' as const,
    },
  },
});

export default mergeConfig(libraryConfig, sharedTestConfig);
```

`libs/pdf-template/util/src/index.ts`:
```typescript
export * from './lib/pdf-template.util';
```

- [ ] **Step 3: Create data-access lib config files**

`libs/pdf-template/data-access/tsconfig.json`:
```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true,
    "types": ["node", "vitest"],
    "declaration": true
  },
  "angularCompilerOptions": {
    "strictTemplates": true,
    "strictInjectionParameters": true,
    "fullTemplateTypeCheck": true,
    "disableTypeScriptVersionCheck": true,
    "compileNonExportedClasses": true,
    "skipTemplateCodegen": false
  },
  "include": ["src/**/*", "**/*.spec.ts", "**/*.test.ts"],
  "exclude": ["dist/**/*"],
  "references": [
    { "path": "../../shared/config/tsconfig.lib.json" },
    { "path": "../../shared/data-access/tsconfig.lib.json" },
    { "path": "../../shared/i18n/tsconfig.lib.json" },
    { "path": "../../shared/models/tsconfig.lib.json" },
    { "path": "../../shared/util-core/tsconfig.lib.json" },
    { "path": "../../shared/util-angular/tsconfig.lib.json" },
    { "path": "../util/tsconfig.lib.json" }
  ]
}
```

`libs/pdf-template/data-access/tsconfig.lib.json`:
```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "../../../dist/libs/pdf-template/data-access",
    "declaration": true,
    "composite": true,
    "module": "es2020",
    "target": "es2020",
    "types": [],
    "tsBuildInfoFile": "../../../dist/out-tsc/pdf-template-data-access.tsbuildinfo"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["**/*.spec.ts", "**/*.spec2.ts", "**/test-setup.ts", "vite.config.ts"],
  "references": [
    { "path": "../util/tsconfig.lib.json" }
  ]
}
```

`libs/pdf-template/data-access/package.json`:
```json
{
  "name": "@bk2/pdf-template-data-access",
  "version": "0.0.1",
  "main": "./src/index.js",
  "types": "./src/index.d.ts",
  "sideEffects": false,
  "private": true,
  "dependencies": {
    "tslib": "^2.8.1",
    "@bk2/shared-config": "*",
    "@bk2/shared-data-access": "*",
    "@bk2/shared-i18n": "*",
    "@bk2/shared-models": "*",
    "@bk2/shared-util-core": "*",
    "@bk2/shared-util-angular": "*",
    "@bk2/pdf-template-util": "*"
  }
}
```

`libs/pdf-template/data-access/src/index.ts`:
```typescript
export * from './lib/scope';
export * from './lib/template.service';
export * from './lib/doc-generation.service';
```

- [ ] **Step 4: Create ui lib config files**

`libs/pdf-template/ui/tsconfig.json`:
```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true,
    "types": ["node", "vitest"],
    "declaration": true
  },
  "angularCompilerOptions": {
    "strictTemplates": true,
    "strictInjectionParameters": true,
    "fullTemplateTypeCheck": true,
    "disableTypeScriptVersionCheck": true,
    "compileNonExportedClasses": true,
    "skipTemplateCodegen": false
  },
  "include": ["src/**/*", "**/*.spec.ts", "**/*.test.ts"],
  "exclude": ["dist/**/*"],
  "references": [
    { "path": "../../shared/config/tsconfig.lib.json" },
    { "path": "../../shared/models/tsconfig.lib.json" },
    { "path": "../../shared/pipes/tsconfig.lib.json" },
    { "path": "../../shared/util-angular/tsconfig.lib.json" },
    { "path": "../../shared/i18n/tsconfig.lib.json" },
    { "path": "../data-access/tsconfig.lib.json" }
  ]
}
```

`libs/pdf-template/ui/tsconfig.lib.json`:
```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "../../../dist/libs/pdf-template/ui",
    "declaration": true,
    "composite": true,
    "module": "es2020",
    "target": "es2020",
    "types": [],
    "tsBuildInfoFile": "../../../dist/out-tsc/pdf-template-ui.tsbuildinfo"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["**/*.spec.ts", "**/*.spec2.ts", "**/test-setup.ts", "vite.config.ts"],
  "references": [
    { "path": "../data-access/tsconfig.lib.json" }
  ]
}
```

`libs/pdf-template/ui/package.json`:
```json
{
  "name": "@bk2/pdf-template-ui",
  "version": "0.0.1",
  "main": "./src/index.js",
  "types": "./src/index.d.ts",
  "sideEffects": false,
  "private": true,
  "dependencies": {
    "tslib": "^2.8.1",
    "@bk2/shared-config": "*",
    "@bk2/shared-models": "*",
    "@bk2/shared-pipes": "*",
    "@bk2/shared-util-angular": "*",
    "@bk2/shared-i18n": "*",
    "@bk2/pdf-template-data-access": "*"
  }
}
```

`libs/pdf-template/ui/src/index.ts`:
```typescript
export * from './lib/doc-button';
export * from './lib/pdf-preview.modal';
```

- [ ] **Step 5: Create feature lib config files**

`libs/pdf-template/feature/tsconfig.json`:
```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true,
    "types": ["node", "vitest"],
    "declaration": true
  },
  "angularCompilerOptions": {
    "strictTemplates": true,
    "strictInjectionParameters": true,
    "fullTemplateTypeCheck": true,
    "disableTypeScriptVersionCheck": true,
    "compileNonExportedClasses": true,
    "skipTemplateCodegen": false
  },
  "include": ["src/**/*", "**/*.spec.ts", "**/*.test.ts"],
  "exclude": ["dist/**/*"],
  "references": [
    { "path": "../../shared/config/tsconfig.lib.json" },
    { "path": "../../shared/data-access/tsconfig.lib.json" },
    { "path": "../../shared/feature/tsconfig.lib.json" },
    { "path": "../../shared/i18n/tsconfig.lib.json" },
    { "path": "../../shared/models/tsconfig.lib.json" },
    { "path": "../../shared/pipes/tsconfig.lib.json" },
    { "path": "../../shared/ui/tsconfig.lib.json" },
    { "path": "../../shared/util-angular/tsconfig.lib.json" },
    { "path": "../../shared/util-core/tsconfig.lib.json" },
    { "path": "../data-access/tsconfig.lib.json" },
    { "path": "../ui/tsconfig.lib.json" },
    { "path": "../util/tsconfig.lib.json" }
  ]
}
```

`libs/pdf-template/feature/tsconfig.lib.json`:
```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "../../../dist/libs/pdf-template/feature",
    "declaration": true,
    "composite": true,
    "module": "es2020",
    "target": "es2020",
    "types": [],
    "tsBuildInfoFile": "../../../dist/out-tsc/pdf-template-feature.tsbuildinfo"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["**/*.spec.ts", "**/*.spec2.ts", "**/test-setup.ts", "vite.config.ts"],
  "references": [
    { "path": "../data-access/tsconfig.lib.json" },
    { "path": "../ui/tsconfig.lib.json" },
    { "path": "../util/tsconfig.lib.json" }
  ]
}
```

`libs/pdf-template/feature/package.json`:
```json
{
  "name": "@bk2/pdf-template-feature",
  "version": "0.0.1",
  "main": "./src/index.js",
  "types": "./src/index.d.ts",
  "sideEffects": false,
  "private": true,
  "dependencies": {
    "tslib": "^2.8.1",
    "@bk2/shared-config": "*",
    "@bk2/shared-data-access": "*",
    "@bk2/shared-feature": "*",
    "@bk2/shared-i18n": "*",
    "@bk2/shared-models": "*",
    "@bk2/shared-pipes": "*",
    "@bk2/shared-ui": "*",
    "@bk2/shared-util-angular": "*",
    "@bk2/shared-util-core": "*",
    "@bk2/pdf-template-data-access": "*",
    "@bk2/pdf-template-ui": "*",
    "@bk2/pdf-template-util": "*"
  }
}
```

`libs/pdf-template/feature/src/index.ts`:
```typescript
export * from './lib/scope';
export * from './lib/template.store';
export * from './lib/template-list';
export * from './lib/template-edit.page';
export * from './lib/template-publish.modal';
```

- [ ] **Step 6: Commit scaffolding**

```bash
git add libs/pdf-template/
git commit -m "feat: scaffold pdf-template lib structure (util, data-access, ui, feature)"
```

---

## Task 9: tsconfig.base.json Path Aliases

**Files:**
- Modify: `tsconfig.base.json`

- [ ] **Step 1: Add path aliases**

In `tsconfig.base.json`, inside the `"paths"` object, add these four entries (sorted alphabetically or near existing `pdf-*` / `document-*` entries):

```json
"@bk2/pdf-template-data-access": ["libs/pdf-template/data-access/src/index.ts"],
"@bk2/pdf-template-feature": ["libs/pdf-template/feature/src/index.ts"],
"@bk2/pdf-template-ui": ["libs/pdf-template/ui/src/index.ts"],
"@bk2/pdf-template-util": ["libs/pdf-template/util/src/index.ts"],
```

- [ ] **Step 2: Verify type-check**

```bash
npx tsc --noEmit -p tsconfig.base.json 2>&1 | head -20
```
Expected: No path-related errors (the libs have no source code yet, that's fine).

- [ ] **Step 3: Commit**

```bash
git add tsconfig.base.json
git commit -m "chore: add @bk2/pdf-template-* path aliases to tsconfig.base.json"
```

---

## Task 10: Template Util + Unit Tests

**Files:**
- Create: `libs/pdf-template/util/src/lib/pdf-template.util.ts`
- Create: `libs/pdf-template/util/src/lib/pdf-template.util.spec.ts`

- [ ] **Step 1: Write failing tests first**

```typescript
// libs/pdf-template/util/src/lib/pdf-template.util.spec.ts
import { describe, it, expect } from 'vitest';
import { newTemplate, newTemplateVersion, getTemplateIndex } from './pdf-template.util';

describe('newTemplate', () => {
  it('sets tenants from tenantId', () => {
    const t = newTemplate('tenant1');
    expect(t.tenants).toEqual(['tenant1']);
  });

  it('has default status draft', () => {
    const t = newTemplate('tenant1');
    expect(t.status).toBe('draft');
  });

  it('has default outputFormat pdf', () => {
    const t = newTemplate('tenant1');
    expect(t.defaultOutputFormat).toBe('pdf');
  });
});

describe('newTemplateVersion', () => {
  it('creates version 1 by default', () => {
    const v = newTemplateVersion();
    expect(v.version).toBe(1);
  });

  it('creates version with status draft', () => {
    const v = newTemplateVersion();
    expect(v.status).toBe('draft');
  });
});

describe('getTemplateIndex', () => {
  it('includes name in index', () => {
    const t = newTemplate('t1');
    t.name = 'Rechnung Standard';
    const idx = getTemplateIndex(t);
    expect(idx).toContain('Rechnung Standard');
  });

  it('includes category in index', () => {
    const t = newTemplate('t1');
    t.category = 'invoice';
    const idx = getTemplateIndex(t);
    expect(idx).toContain('invoice');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm run test pdf-template-util 2>&1 | tail -15
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the util**

```typescript
// libs/pdf-template/util/src/lib/pdf-template.util.ts
import { TemplateModel, TemplateVersionModel } from '@bk2/shared-models';
import { addIndexElement } from '@bk2/shared-util-core';

export function newTemplate(tenantId: string): TemplateModel {
  return new TemplateModel(tenantId);
}

export function newTemplateVersion(version = 1): TemplateVersionModel {
  const v = new TemplateVersionModel();
  v.version = version;
  v.bkey = String(version);
  return v;
}

export function getTemplateIndex(template: TemplateModel): string {
  let index = '';
  index = addIndexElement(index, 'n', template.name);
  index = addIndexElement(index, 'c', template.category);
  index = addIndexElement(index, 'l', template.language);
  return index;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm run test pdf-template-util 2>&1 | tail -10
```
Expected: 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add libs/pdf-template/util/src/
git commit -m "feat(pdf-template-util): newTemplate, newTemplateVersion, getTemplateIndex with tests"
```

---

## Task 11: Template Service

**Files:**
- Create: `libs/pdf-template/data-access/src/lib/scope.ts`
- Create: `libs/pdf-template/data-access/src/lib/template.service.ts`

- [ ] **Step 1: Create scope.ts**

```typescript
// libs/pdf-template/data-access/src/lib/scope.ts
export const PFX = '@pdf-template/data-access.';
```

- [ ] **Step 2: Create template.service.ts**

```typescript
// libs/pdf-template/data-access/src/lib/template.service.ts
import { inject, Injectable } from '@angular/core';
import { collectionData, docData } from 'rxfire/firestore';
import {
  collection, doc, addDoc, updateDoc, deleteDoc, serverTimestamp,
  query, where, orderBy, getDocs, setDoc, Firestore
} from 'firebase/firestore';
import { Observable, map, shareReplay } from 'rxjs';

import { ENV } from '@bk2/shared-config';
import { FIRESTORE } from '@bk2/shared-config';
import { I18nService } from '@bk2/shared-i18n';
import {
  TemplateCollection, TemplateVersionSubcollection,
  TemplateModel, TemplateVersionModel, UserModel
} from '@bk2/shared-models';
import { getTemplateIndex, newTemplateVersion } from '@bk2/pdf-template-util';
import { getTodayStr, DateFormat } from '@bk2/shared-util-core';
import { error, success } from '@bk2/shared-util-angular';
import { PFX } from './scope';

@Injectable({ providedIn: 'root' })
export class TemplateService {
  private readonly firestore = inject(FIRESTORE);
  private readonly env = inject(ENV);
  private readonly i18nService = inject(I18nService);
  private readonly i18n = this.i18nService.translateAll({
    create_conf:  PFX + 'create.conf',
    create_error: PFX + 'create.error',
    update_conf:  PFX + 'update.conf',
    update_error: PFX + 'update.error',
    delete_conf:  PFX + 'delete.conf',
    delete_error: PFX + 'delete.error',
  });

  private get tenantId(): string { return this.env.tenantId; }

  public list(): Observable<TemplateModel[]> {
    const q = query(
      collection(this.firestore, TemplateCollection),
      where('tenants', 'array-contains', this.tenantId),
      where('isArchived', '==', false),
      orderBy('name')
    );
    return (collectionData(q, { idField: 'bkey' }) as Observable<TemplateModel[]>).pipe(shareReplay(1));
  }

  public read(key: string): Observable<TemplateModel | undefined> {
    return docData(doc(this.firestore, TemplateCollection, key), { idField: 'bkey' }) as Observable<TemplateModel | undefined>;
  }

  public async create(template: TemplateModel, currentUser?: UserModel): Promise<string | undefined> {
    try {
      template.index = getTemplateIndex(template);
      template.createdAt = getTodayStr(DateFormat.storeDate);
      template.createdBy = currentUser?.bkey ?? '';
      template.updatedAt = template.createdAt;
      template.updatedBy = template.createdBy;
      const { bkey, ...data } = template;
      const ref = await addDoc(collection(this.firestore, TemplateCollection), data);
      success(this.i18n.create_conf());
      return ref.id;
    } catch (e) {
      error(String(e), this.i18n.create_error());
      return undefined;
    }
  }

  public async update(template: TemplateModel, currentUser?: UserModel): Promise<void> {
    try {
      template.index = getTemplateIndex(template);
      template.updatedAt = getTodayStr(DateFormat.storeDate);
      template.updatedBy = currentUser?.bkey ?? '';
      const { bkey, ...data } = template;
      await updateDoc(doc(this.firestore, TemplateCollection, bkey), data as Record<string, unknown>);
      success(this.i18n.update_conf());
    } catch (e) {
      error(String(e), this.i18n.update_error());
    }
  }

  public async delete(template: TemplateModel): Promise<void> {
    try {
      await deleteDoc(doc(this.firestore, TemplateCollection, template.bkey));
      success(this.i18n.delete_conf());
    } catch (e) {
      error(String(e), this.i18n.delete_error());
    }
  }

  // ── Version operations ──────────────────────────────────────────────────

  public listVersions(templateKey: string): Observable<TemplateVersionModel[]> {
    const q = query(
      collection(this.firestore, TemplateCollection, templateKey, TemplateVersionSubcollection),
      orderBy('version', 'desc')
    );
    return collectionData(q, { idField: 'bkey' }) as Observable<TemplateVersionModel[]>;
  }

  public readVersion(templateKey: string, version: number): Observable<TemplateVersionModel | undefined> {
    return docData(
      doc(this.firestore, TemplateCollection, templateKey, TemplateVersionSubcollection, String(version)),
      { idField: 'bkey' }
    ) as Observable<TemplateVersionModel | undefined>;
  }

  public async saveDraftVersion(
    templateKey: string,
    version: TemplateVersionModel,
    currentUser?: UserModel
  ): Promise<void> {
    version.createdBy = currentUser?.bkey ?? '';
    version.createdAt = getTodayStr(DateFormat.storeDate);
    const { bkey, ...data } = version;
    await setDoc(
      doc(this.firestore, TemplateCollection, templateKey, TemplateVersionSubcollection, String(version.version)),
      data
    );
  }

  public async publishVersion(
    templateKey: string,
    versionNum: number,
    changelog: string,
    currentUser?: UserModel
  ): Promise<void> {
    const versionRef = doc(
      this.firestore,
      TemplateCollection, templateKey,
      TemplateVersionSubcollection, String(versionNum)
    );
    const templateRef = doc(this.firestore, TemplateCollection, templateKey);

    await updateDoc(versionRef, {
      status: 'published',
      publishedAt: getTodayStr(DateFormat.storeDate),
      publishedBy: currentUser?.bkey ?? '',
      changelog,
    });

    await updateDoc(templateRef, {
      status: 'published',
      currentVersion: versionNum,
      draftVersion: null,
      updatedAt: getTodayStr(DateFormat.storeDate),
      updatedBy: currentUser?.bkey ?? '',
    });
  }
}
```

- [ ] **Step 3: Type-check the lib**

```bash
npx tsc --noEmit -p libs/pdf-template/data-access/tsconfig.json 2>&1 | head -20
```
Expected: no errors (or only "cannot find module" for shared-config if FIRESTORE token needs checking).

If `FIRESTORE` is not exported from `@bk2/shared-config`, find the correct import. Check:
```bash
grep -r "export.*FIRESTORE\|InjectionToken.*firestore" libs/shared/config/src/ | head -5
```
Use the correct token name.

- [ ] **Step 4: Commit**

```bash
git add libs/pdf-template/data-access/src/lib/scope.ts libs/pdf-template/data-access/src/lib/template.service.ts
git commit -m "feat(pdf-template-data-access): TemplateService with Firestore CRUD and version management"
```

---

## Task 12: DocGenerationService

**Files:**
- Create: `libs/pdf-template/data-access/src/lib/doc-generation.service.ts`

- [ ] **Step 1: Create doc-generation.service.ts**

```typescript
// libs/pdf-template/data-access/src/lib/doc-generation.service.ts
import { Injectable, inject } from '@angular/core';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { getApp } from 'firebase/app';
import { isDevMode } from '@angular/core';

export interface GenerateDocumentRequest {
  templateId?: string;
  templateVersion?: number;
  payload?: Record<string, unknown>;
  html?: string;
  options?: {
    outputFormat?: 'pdf' | 'docx' | 'html';
    format?: 'A4' | 'A5' | 'Letter';
    orientation?: 'portrait' | 'landscape';
    margin?: { top?: string; bottom?: string; left?: string; right?: string };
    filename?: string;
    storageMode?: 'persist' | 'ephemeral';
    metadata?: { entityType?: string; entityId?: string };
  };
}

export interface GenerateDocumentResponse {
  url: string;
  storagePath: string;
  filename: string;
  sizeBytes: number;
  outputFormat: 'pdf' | 'docx' | 'html';
  generatedAt: string;
  templateVersion?: number;
  generationId: string;
}

@Injectable({ providedIn: 'root' })
export class DocGenerationService {
  private get functions() {
    const fns = getFunctions(getApp(), 'europe-west6');
    if (isDevMode()) {
      try { connectFunctionsEmulator(fns, 'localhost', 5001); } catch { /* already connected */ }
    }
    return fns;
  }

  public async generate(req: GenerateDocumentRequest): Promise<GenerateDocumentResponse> {
    const callable = httpsCallable<GenerateDocumentRequest, GenerateDocumentResponse>(
      this.functions,
      'generateDocument'
    );
    const result = await callable(req);
    return result.data;
  }

  public async preview(
    templateId: string,
    payload: Record<string, unknown>,
    version?: number
  ): Promise<GenerateDocumentResponse> {
    return this.generate({
      templateId,
      templateVersion: version,
      payload,
      options: { storageMode: 'ephemeral' },
    });
  }

  public async printHtml(
    html: string,
    filename?: string,
    entityType?: string,
    entityId?: string
  ): Promise<GenerateDocumentResponse> {
    return this.generate({
      html,
      options: {
        storageMode: 'ephemeral',
        filename,
        metadata: entityType ? { entityType, entityId } : undefined,
      },
    });
  }
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit -p libs/pdf-template/data-access/tsconfig.json 2>&1 | head -20
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add libs/pdf-template/data-access/src/lib/doc-generation.service.ts
git commit -m "feat(pdf-template-data-access): DocGenerationService callable wrapper"
```

---

## Task 13: PDF Preview Modal

**Files:**
- Create: `libs/pdf-template/ui/src/lib/pdf-preview.modal.ts`

- [ ] **Step 1: Create pdf-preview.modal.ts**

```typescript
// libs/pdf-template/ui/src/lib/pdf-preview.modal.ts
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { inject } from '@angular/core';
import { ModalController } from '@ionic/angular/standalone';
import {
  IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon,
  IonContent, IonFooter
} from '@ionic/angular/standalone';
import { SvgIconPipe } from '@bk2/shared-pipes';

@Component({
  selector: 'bk-pdf-preview-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    SvgIconPipe,
    IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon,
    IonContent, IonFooter,
  ],
  styles: [`
    .preview-frame { width: 100%; height: calc(100vh - 120px); border: none; }
    .no-preview { display: flex; align-items: center; justify-content: center; height: 200px; color: var(--ion-color-medium); }
  `],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-title>{{ title() }}</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="download()">
            <ion-icon src="{{ 'download' | svgIcon }}" slot="icon-only" />
          </ion-button>
          <ion-button (click)="close()">
            <ion-icon src="{{ 'cancel-circle' | svgIcon }}" slot="icon-only" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      @if(safeUrl(); as url) {
        @if(outputFormat() === 'pdf') {
          <iframe [src]="url" class="preview-frame" title="PDF Preview"></iframe>
        } @else {
          <div class="no-preview">
            <p>Vorschau nicht verfügbar. Bitte herunterladen.</p>
          </div>
        }
      } @else {
        <div class="no-preview"><p>Kein Dokument geladen.</p></div>
      }
    </ion-content>

    <ion-footer>
      <ion-toolbar>
        <ion-buttons slot="end">
          <ion-button fill="outline" (click)="close()">Schliessen</ion-button>
          <ion-button fill="solid" color="primary" (click)="download()">
            <ion-icon src="{{ 'download' | svgIcon }}" slot="start" />
            Herunterladen
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-footer>
  `
})
export class PdfPreviewModal {
  private readonly modalController = inject(ModalController);
  private readonly sanitizer = inject(DomSanitizer);

  public readonly url = input<string>('');
  public readonly title = input<string>('Dokument');
  public readonly filename = input<string>('document.pdf');
  public readonly outputFormat = input<'pdf' | 'docx' | 'html'>('pdf');

  protected readonly safeUrl = computed((): SafeResourceUrl | null => {
    const u = this.url();
    return u ? this.sanitizer.bypassSecurityTrustResourceUrl(u) : null;
  });

  protected async close(): Promise<void> {
    await this.modalController.dismiss(null, 'cancel');
  }

  protected download(): void {
    const u = this.url();
    if (!u) return;
    const a = document.createElement('a');
    a.href = u;
    a.download = this.filename();
    a.click();
  }
}
```

- [ ] **Step 2: Type-check ui lib**

```bash
npx tsc --noEmit -p libs/pdf-template/ui/tsconfig.json 2>&1 | head -20
```
Expected: no errors (doc-button not yet created; that's OK since index.ts re-exports it).

- [ ] **Step 3: Commit**

```bash
git add libs/pdf-template/ui/src/lib/pdf-preview.modal.ts
git commit -m "feat(pdf-template-ui): PdfPreviewModal with iframe PDF viewer"
```

---

## Task 14: DocButton Component

**Files:**
- Create: `libs/pdf-template/ui/src/lib/doc-button.ts`

- [ ] **Step 1: Create doc-button.ts**

```typescript
// libs/pdf-template/ui/src/lib/doc-button.ts
import {
  ChangeDetectionStrategy, Component, EventEmitter, inject,
  input, OnInit, Output, signal
} from '@angular/core';
import { ModalController, ToastController } from '@ionic/angular/standalone';
import { IonButton, IonIcon, IonSpinner } from '@ionic/angular/standalone';
import { SvgIconPipe } from '@bk2/shared-pipes';

import {
  DocGenerationService, GenerateDocumentRequest, GenerateDocumentResponse
} from '@bk2/pdf-template-data-access';
import { PdfPreviewModal } from './pdf-preview.modal';

@Component({
  selector: 'bk-doc-button',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SvgIconPipe, IonButton, IonIcon, IonSpinner],
  template: `
    @if(variant() !== 'icon-only') {
      <ion-button
        [fill]="variant() === 'primary' ? 'solid' : 'outline'"
        [disabled]="isLoading()"
        (click)="generate()">
        @if(isLoading()) {
          <ion-spinner name="crescent" slot="start" />
        } @else {
          <ion-icon src="{{ icon() | svgIcon }}" slot="start" />
        }
        {{ label() }}
      </ion-button>
    } @else {
      <ion-button fill="clear" [disabled]="isLoading()" (click)="generate()">
        @if(isLoading()) {
          <ion-spinner name="crescent" slot="icon-only" />
        } @else {
          <ion-icon src="{{ icon() | svgIcon }}" slot="icon-only" />
        }
      </ion-button>
    }
  `
})
export class DocButton {
  private readonly docGenService = inject(DocGenerationService);
  private readonly modalController = inject(ModalController);
  private readonly toastController = inject(ToastController);

  public readonly templateId = input.required<string>();
  public readonly payload = input.required<Record<string, unknown>>();
  public readonly templateVersion = input<number | undefined>(undefined);
  public readonly outputFormat = input<'pdf' | 'docx' | 'html'>('pdf');
  public readonly label = input<string>('Dokument erstellen');
  public readonly icon = input<string>('document');
  public readonly variant = input<'primary' | 'secondary' | 'icon-only'>('primary');
  public readonly filename = input<string | undefined>(undefined);
  public readonly autoDownload = input<boolean>(false);
  public readonly autoOpenPreview = input<boolean>(true);
  public readonly entityType = input<string | undefined>(undefined);
  public readonly entityId = input<string | undefined>(undefined);

  @Output() public readonly generated = new EventEmitter<GenerateDocumentResponse>();
  @Output() public readonly errorOccurred = new EventEmitter<Error>();

  protected readonly isLoading = signal(false);

  protected async generate(): Promise<void> {
    this.isLoading.set(true);
    const toast = await this.toastController.create({
      message: 'Dokument wird erstellt…',
      duration: 0,
      position: 'bottom',
    });

    const timeoutId = setTimeout(() => toast.present(), 2000);

    try {
      const req: GenerateDocumentRequest = {
        templateId: this.templateId(),
        templateVersion: this.templateVersion(),
        payload: this.payload(),
        options: {
          outputFormat: this.outputFormat(),
          filename: this.filename(),
          storageMode: 'persist',
          metadata: this.entityType()
            ? { entityType: this.entityType(), entityId: this.entityId() }
            : undefined,
        },
      };

      const response = await this.docGenService.generate(req);
      clearTimeout(timeoutId);
      await toast.dismiss();
      this.generated.emit(response);

      if (this.autoDownload()) {
        const a = document.createElement('a');
        a.href = response.url;
        a.download = response.filename;
        a.click();
      } else if (this.autoOpenPreview() && response.outputFormat === 'pdf') {
        const modal = await this.modalController.create({
          component: PdfPreviewModal,
          componentProps: {
            url: response.url,
            title: response.filename,
            filename: response.filename,
            outputFormat: response.outputFormat,
          },
        });
        await modal.present();
      }
    } catch (err) {
      clearTimeout(timeoutId);
      await toast.dismiss();
      const e = err instanceof Error ? err : new Error(String(err));
      this.errorOccurred.emit(e);
      const errToast = await this.toastController.create({
        message: `Fehler: ${e.message}`,
        duration: 4000,
        color: 'danger',
        position: 'bottom',
      });
      await errToast.present();
    } finally {
      this.isLoading.set(false);
    }
  }
}
```

- [ ] **Step 2: Type-check ui lib**

```bash
npx tsc --noEmit -p libs/pdf-template/ui/tsconfig.json 2>&1 | head -20
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add libs/pdf-template/ui/src/lib/doc-button.ts
git commit -m "feat(pdf-template-ui): DocButton component with loading state and PDF preview"
```

---

## Task 15: Template Store

**Files:**
- Create: `libs/pdf-template/feature/src/lib/scope.ts`
- Create: `libs/pdf-template/feature/src/lib/template.store.ts`

- [ ] **Step 1: Create scope.ts**

```typescript
// libs/pdf-template/feature/src/lib/scope.ts
export const PFX = '@pdf-template/feature.';
```

- [ ] **Step 2: Create template.store.ts**

```typescript
// libs/pdf-template/feature/src/lib/template.store.ts
import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController, ToastController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { of } from 'rxjs';

import { AppStore } from '@bk2/shared-feature';
import { I18nService } from '@bk2/shared-i18n';
import { TemplateModel, TemplateVersionModel } from '@bk2/shared-models';
import { DocGenerationService, GenerateDocumentResponse, TemplateService } from '@bk2/pdf-template-data-access';
import { newTemplate, newTemplateVersion } from '@bk2/pdf-template-util';
import { nameMatches } from '@bk2/shared-util-core';

import { PFX } from './scope';
import { TemplatePublishModal } from './template-publish.modal';

const TEMPLATE_I18N_KEYS = {
  list_title: PFX + 'list.title',
  empty: PFX + 'empty',
  ok: '@ok',
  cancel: '@cancel',
  save: '@save.label',
  delete_confirm: PFX + 'delete.confirm',
  as_edit: PFX + 'actionsheet.edit',
  as_delete: PFX + 'actionsheet.delete',
  as_duplicate: PFX + 'actionsheet.duplicate',
  as_archive: PFX + 'actionsheet.archive',
  as_preview: PFX + 'actionsheet.preview',
  save_draft_conf: PFX + 'save.draft.conf',
  save_draft_error: PFX + 'save.draft.error',
  publish_conf: PFX + 'publish.conf',
  publish_error: PFX + 'publish.error',
  delete_conf: PFX + 'delete.conf',
  delete_error: PFX + 'delete.error',
  preview_error: PFX + 'preview.error',
  name_label: PFX + 'name.label',
  category_label: PFX + 'category.label',
  language_label: PFX + 'language.label',
  status_label: PFX + 'status.label',
  version_label: PFX + 'version.label',
  html_label: PFX + 'html.label',
  css_label: PFX + 'css.label',
  preview_label: PFX + 'preview.label',
} satisfies Record<string, string>;

export type TemplateI18n = { [K in keyof typeof TEMPLATE_I18N_KEYS]: import('@angular/core').Signal<string> };

interface TemplateState {
  searchTerm: string;
  previewUrl: string;
  previewLoading: boolean;
}

export const TemplateStore = signalStore(
  withProps(() => ({
    i18nService: inject(I18nService),
    templateService: inject(TemplateService),
    docGenService: inject(DocGenerationService),
    appStore: inject(AppStore),
    modalController: inject(ModalController),
    toastController: inject(ToastController),
  })),
  withProps(store => ({
    i18n: store.i18nService.translateAll(TEMPLATE_I18N_KEYS) as TemplateI18n,
  })),
  withState<TemplateState>({
    searchTerm: '',
    previewUrl: '',
    previewLoading: false,
  }),
  withProps(store => ({
    _templates: rxResource({
      loader: () => store.templateService.list(),
    }),
  })),
  withComputed(store => ({
    isLoading: computed(() => store._templates.isLoading()),
    templates: computed(() => store._templates.value() ?? []),
    currentUser: computed(() => store.appStore.currentUser()),
    filteredTemplates: computed(() => {
      const term = store.searchTerm();
      const all = store._templates.value() ?? [];
      if (!term) return all;
      return all.filter(t => nameMatches(t.index, term));
    }),
  })),
  withMethods(store => ({
    setSearchTerm(term: string): void {
      patchState(store, { searchTerm: term });
    },

    async createTemplate(): Promise<string | undefined> {
      const tmpl = newTemplate(store.appStore.tenantId?.() ?? '');
      return store.templateService.create(tmpl, store.currentUser());
    },

    async updateTemplate(template: TemplateModel): Promise<void> {
      await store.templateService.update(template, store.currentUser());
    },

    async deleteTemplate(template: TemplateModel): Promise<void> {
      await store.templateService.delete(template);
    },

    async saveDraft(templateKey: string, version: TemplateVersionModel): Promise<void> {
      try {
        await store.templateService.saveDraftVersion(templateKey, version, store.currentUser());
        const toast = await store.toastController.create({
          message: store.i18n.save_draft_conf(),
          duration: 2000,
          color: 'success',
        });
        await toast.present();
      } catch {
        const toast = await store.toastController.create({
          message: store.i18n.save_draft_error(),
          duration: 3000,
          color: 'danger',
        });
        await toast.present();
      }
    },

    async openPublishDialog(templateKey: string, versionNum: number): Promise<boolean> {
      const modal = await store.modalController.create({
        component: TemplatePublishModal,
        componentProps: { versionNum },
      });
      await modal.present();
      const { data, role } = await modal.onWillDismiss<{ changelog: string }>();
      if (role !== 'confirm' || !data?.changelog) return false;

      try {
        await store.templateService.publishVersion(
          templateKey, versionNum, data.changelog, store.currentUser()
        );
        const toast = await store.toastController.create({
          message: store.i18n.publish_conf(),
          duration: 2000,
          color: 'success',
        });
        await toast.present();
        return true;
      } catch {
        const toast = await store.toastController.create({
          message: store.i18n.publish_error(),
          duration: 3000,
          color: 'danger',
        });
        await toast.present();
        return false;
      }
    },

    async generatePreview(
      templateKey: string,
      version: TemplateVersionModel,
      sampleData: string
    ): Promise<GenerateDocumentResponse | undefined> {
      patchState(store, { previewLoading: true, previewUrl: '' });
      try {
        let payload: Record<string, unknown> = {};
        try { payload = JSON.parse(sampleData || '{}'); } catch { /* ignore parse error */ }

        // Save draft first so CF can load it
        await store.templateService.saveDraftVersion(templateKey, version, store.currentUser());
        const response = await store.docGenService.preview(templateKey, payload, version.version);
        patchState(store, { previewUrl: response.url });
        return response;
      } catch (err) {
        const toast = await store.toastController.create({
          message: `${store.i18n.preview_error()}: ${String(err)}`,
          duration: 4000,
          color: 'danger',
        });
        await toast.present();
        return undefined;
      } finally {
        patchState(store, { previewLoading: false });
      }
    },
  }))
);
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit -p libs/pdf-template/feature/tsconfig.json 2>&1 | head -20
```
Expected: no errors (template-publish.modal not yet created; if that errors, create a stub — see Task 17).

- [ ] **Step 4: Commit**

```bash
git add libs/pdf-template/feature/src/lib/scope.ts libs/pdf-template/feature/src/lib/template.store.ts
git commit -m "feat(pdf-template-feature): TemplateStore with NgRx Signals"
```

---

## Task 16: Template List Component

**Files:**
- Create: `libs/pdf-template/feature/src/lib/template-list.ts`

- [ ] **Step 1: Create template-list.ts**

```typescript
// libs/pdf-template/feature/src/lib/template-list.ts
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ActionSheetController } from '@ionic/angular/standalone';
import {
  IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon,
  IonContent, IonLabel, IonGrid, IonRow, IonCol, IonChip, IonMenuButton
} from '@ionic/angular/standalone';
import { ModalController } from '@ionic/angular/standalone';

import { TemplateModel } from '@bk2/shared-models';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { EmptyList, ListFilter, Spinner } from '@bk2/shared-ui';
import { createActionSheetButton, createActionSheetOptions } from '@bk2/shared-util-angular';

import { TemplateStore } from './template.store';

@Component({
  selector: 'bk-template-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [TemplateStore],
  imports: [
    SvgIconPipe,
    Spinner, ListFilter, EmptyList,
    IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon, IonMenuButton,
    IonContent, IonLabel, IonGrid, IonRow, IonCol, IonChip,
  ],
  styles: [`
    .t-name { font-size: 1rem; }
    .t-meta { font-size: 0.8rem; color: var(--ion-color-medium); }
    ion-chip { font-size: 0.75rem; height: 20px; }
  `],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
        <ion-title>{{ store.filteredTemplates().length }} {{ store.i18n.list_title() }}</ion-title>
        <ion-buttons slot="end">
          <ion-button fill="clear" (click)="create()">
            <ion-icon src="{{ 'add-circle' | svgIcon }}" slot="icon-only" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
      <bk-list-filter (searchTermChanged)="store.setSearchTerm($event)" />
    </ion-header>

    <ion-content>
      @if(store.isLoading()) {
        <bk-spinner />
      } @else if(store.filteredTemplates().length === 0) {
        <bk-empty-list message="@pdf-template/feature.empty" />
      } @else {
        <ion-grid>
          @for(tmpl of store.filteredTemplates(); track tmpl.bkey) {
            <ion-row (click)="showActions(tmpl)">
              <ion-col size="5">
                <ion-label>
                  <p class="t-name">{{ tmpl.name }}</p>
                  <p class="t-meta">{{ tmpl.category }} · {{ tmpl.language }}</p>
                </ion-label>
              </ion-col>
              <ion-col size="2" class="ion-align-self-center">
                <ion-chip [outline]="true" size="small">
                  {{ tmpl.defaultOutputFormat | uppercase }}
                </ion-chip>
              </ion-col>
              <ion-col size="2" class="ion-align-self-center">
                v{{ tmpl.currentVersion }}{{ tmpl.draftVersion ? ' (v' + tmpl.draftVersion + '*)' : '' }}
              </ion-col>
              <ion-col size="3" class="ion-align-self-center">
                <ion-chip [outline]="true" size="small"
                  [color]="tmpl.status === 'published' ? 'success' : tmpl.status === 'draft' ? 'warning' : 'medium'">
                  {{ tmpl.status }}
                </ion-chip>
              </ion-col>
            </ion-row>
          }
        </ion-grid>
      }
    </ion-content>
  `
})
export class TemplateList {
  protected readonly store = inject(TemplateStore);
  private readonly router = inject(Router);
  private readonly actionSheetController = inject(ActionSheetController);

  protected async create(): Promise<void> {
    const key = await this.store.createTemplate();
    if (key) {
      await this.router.navigate(['/templates', key]);
    }
  }

  protected async showActions(tmpl: TemplateModel): Promise<void> {
    const sheet = await this.actionSheetController.create(
      createActionSheetOptions(tmpl.name, [
        createActionSheetButton(this.store.i18n.as_edit(), 'edit', () =>
          this.router.navigate(['/templates', tmpl.bkey])
        ),
        createActionSheetButton(this.store.i18n.as_delete(), 'delete', () =>
          this.store.deleteTemplate(tmpl)
        ),
      ])
    );
    await sheet.present();
  }
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit -p libs/pdf-template/feature/tsconfig.json 2>&1 | head -20
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add libs/pdf-template/feature/src/lib/template-list.ts
git commit -m "feat(pdf-template-feature): TemplateList component"
```

---

## Task 17: Template Edit Page + Publish Modal

**Files:**
- Create: `libs/pdf-template/feature/src/lib/template-publish.modal.ts`
- Create: `libs/pdf-template/feature/src/lib/template-edit.page.ts`

- [ ] **Step 1: Create template-publish.modal.ts**

```typescript
// libs/pdf-template/feature/src/lib/template-publish.modal.ts
import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ModalController } from '@ionic/angular/standalone';
import {
  IonHeader, IonToolbar, IonTitle, IonButtons, IonButton,
  IonContent, IonItem, IonLabel, IonTextarea, IonFooter
} from '@ionic/angular/standalone';

@Component({
  selector: 'bk-template-publish-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    IonHeader, IonToolbar, IonTitle, IonButtons, IonButton,
    IonContent, IonItem, IonLabel, IonTextarea, IonFooter,
  ],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-title>Version {{ versionNum() }} veröffentlichen</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="cancel()">Abbrechen</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <ion-item>
        <ion-label position="stacked">Änderungsnotiz (Pflicht)</ion-label>
        <ion-textarea
          [(ngModel)]="changelog"
          placeholder="Beschreibe die Änderungen in dieser Version…"
          [rows]="4"
          autoGrow="true"
        />
      </ion-item>
    </ion-content>
    <ion-footer>
      <ion-toolbar>
        <ion-buttons slot="end">
          <ion-button fill="outline" (click)="cancel()">Abbrechen</ion-button>
          <ion-button fill="solid" color="primary" [disabled]="!changelog()" (click)="confirm()">
            Version {{ versionNum() }} veröffentlichen
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-footer>
  `
})
export class TemplatePublishModal {
  private readonly modalController = inject(ModalController);

  public readonly versionNum = input<number>(1);
  protected readonly changelog = signal('');

  protected async cancel(): Promise<void> {
    await this.modalController.dismiss(null, 'cancel');
  }

  protected async confirm(): Promise<void> {
    await this.modalController.dismiss({ changelog: this.changelog() }, 'confirm');
  }
}
```

- [ ] **Step 2: Create template-edit.page.ts**

```typescript
// libs/pdf-template/feature/src/lib/template-edit.page.ts
import {
  ChangeDetectionStrategy, Component, computed, effect, inject,
  linkedSignal, signal
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { rxResource } from '@angular/core/rxjs-interop';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { of } from 'rxjs';
import {
  IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon,
  IonContent, IonSegment, IonSegmentButton, IonLabel, IonItem,
  IonInput, IonSelect, IonSelectOption, IonTextarea, IonSpinner,
  IonMenuButton, IonBackButton
} from '@ionic/angular/standalone';

import { TemplateModel, TemplateVersionModel } from '@bk2/shared-models';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { safeStructuredClone } from '@bk2/shared-util-core';
import { newTemplateVersion } from '@bk2/pdf-template-util';
import { TemplateService } from '@bk2/pdf-template-data-access';
import { AppStore } from '@bk2/shared-feature';

import { TemplateStore } from './template.store';

type EditorTab = 'metadata' | 'html' | 'css' | 'preview';

@Component({
  selector: 'bk-template-edit-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [TemplateStore],
  imports: [
    FormsModule, SvgIconPipe,
    IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon,
    IonContent, IonSegment, IonSegmentButton, IonLabel, IonItem,
    IonInput, IonSelect, IonSelectOption, IonTextarea, IonSpinner,
    IonMenuButton, IonBackButton,
  ],
  styles: [`
    .editor-area { width: 100%; font-family: monospace; font-size: 0.9rem; min-height: 400px; }
    .preview-frame { width: 100%; height: calc(100vh - 200px); border: none; }
    .preview-placeholder { display: flex; align-items: center; justify-content: center; height: 300px; }
    ion-segment { margin: 8px; }
  `],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-buttons slot="start">
          <ion-back-button defaultHref="/templates" />
        </ion-buttons>
        <ion-title>{{ template()?.name || 'Vorlage' }} · v{{ draftVersion().version }} (Entwurf)</ion-title>
        <ion-buttons slot="end">
          <ion-button fill="outline" (click)="saveDraft()" [disabled]="saving()">Speichern</ion-button>
          <ion-button fill="solid" color="primary" (click)="publish()" [disabled]="saving()">
            Veröffentlichen
          </ion-button>
        </ion-buttons>
      </ion-toolbar>

      <ion-segment [(ngModel)]="activeTab">
        <ion-segment-button value="metadata"><ion-label>Metadaten</ion-label></ion-segment-button>
        <ion-segment-button value="html"><ion-label>HTML</ion-label></ion-segment-button>
        <ion-segment-button value="css"><ion-label>CSS</ion-label></ion-segment-button>
        <ion-segment-button value="preview"><ion-label>Vorschau</ion-label></ion-segment-button>
      </ion-segment>
    </ion-header>

    <ion-content class="ion-padding">
      @if(activeTab() === 'metadata') {
        @if(template(); as tmpl) {
          <ion-item>
            <ion-label position="stacked">Name</ion-label>
            <ion-input [(ngModel)]="tmpl.name" (ngModelChange)="onTemplateChange(tmpl)" />
          </ion-item>
          <ion-item>
            <ion-label position="stacked">Beschreibung</ion-label>
            <ion-input [(ngModel)]="tmpl.description" (ngModelChange)="onTemplateChange(tmpl)" />
          </ion-item>
          <ion-item>
            <ion-label position="stacked">Kategorie</ion-label>
            <ion-select [(ngModel)]="tmpl.category" (ngModelChange)="onTemplateChange(tmpl)">
              <ion-select-option value="invoice">Rechnung</ion-select-option>
              <ion-select-option value="expense">Spesen</ion-select-option>
              <ion-select-option value="report">Bericht</ion-select-option>
              <ion-select-option value="dunning">Mahnung</ion-select-option>
              <ion-select-option value="other">Sonstiges</ion-select-option>
            </ion-select>
          </ion-item>
          <ion-item>
            <ion-label position="stacked">Sprache</ion-label>
            <ion-select [(ngModel)]="tmpl.language" (ngModelChange)="onTemplateChange(tmpl)">
              <ion-select-option value="de">Deutsch</ion-select-option>
              <ion-select-option value="fr">Français</ion-select-option>
              <ion-select-option value="it">Italiano</ion-select-option>
              <ion-select-option value="en">English</ion-select-option>
            </ion-select>
          </ion-item>
          <ion-item>
            <ion-label position="stacked">Ausgabeformat</ion-label>
            <ion-select [(ngModel)]="tmpl.defaultOutputFormat" (ngModelChange)="onTemplateChange(tmpl)">
              <ion-select-option value="pdf">PDF</ion-select-option>
              <ion-select-option value="docx">DOCX</ion-select-option>
              <ion-select-option value="html">HTML</ion-select-option>
            </ion-select>
          </ion-item>
          <ion-item>
            <ion-label position="stacked">Beispieldaten (JSON)</ion-label>
            <ion-textarea
              [(ngModel)]="tmpl.sampleData"
              (ngModelChange)="onTemplateChange(tmpl)"
              class="editor-area"
              [rows]="8"
              autoGrow="false"
              placeholder='{}'
            />
          </ion-item>
        }
      }

      @if(activeTab() === 'html') {
        <ion-textarea
          [(ngModel)]="draftVersion().html"
          (ngModelChange)="onVersionChange('html', $event)"
          class="editor-area"
          [rows]="30"
          autoGrow="false"
          placeholder="<!DOCTYPE html><html>..."
        />
      }

      @if(activeTab() === 'css') {
        <ion-textarea
          [(ngModel)]="draftVersion().css"
          (ngModelChange)="onVersionChange('css', $event)"
          class="editor-area"
          [rows]="30"
          autoGrow="false"
          placeholder="body { font-family: Arial, sans-serif; }"
        />
      }

      @if(activeTab() === 'preview') {
        <div style="display: flex; gap: 8px; margin-bottom: 8px;">
          <ion-button fill="outline" size="small" (click)="refreshPreview()" [disabled]="store.previewLoading()">
            @if(store.previewLoading()) {
              <ion-spinner name="crescent" slot="start" />
            } @else {
              <ion-icon src="{{ 'reload' | svgIcon }}" slot="start" />
            }
            Vorschau aktualisieren
          </ion-button>
          @if(store.previewUrl()) {
            <ion-button fill="outline" size="small" (click)="downloadPreview()">
              <ion-icon src="{{ 'download' | svgIcon }}" slot="start" />
              Herunterladen
            </ion-button>
          }
        </div>
        @if(safePreviewUrl(); as url) {
          <iframe [src]="url" class="preview-frame" title="Vorschau"></iframe>
        } @else if(!store.previewLoading()) {
          <div class="preview-placeholder">
            <p>Klicke auf "Vorschau aktualisieren" um eine Vorschau zu generieren.</p>
          </div>
        }
      }
    </ion-content>
  `
})
export class TemplateEditPage {
  protected readonly store = inject(TemplateStore);
  private readonly templateService = inject(TemplateService);
  private readonly appStore = inject(AppStore);
  private readonly route = inject(ActivatedRoute);
  private readonly sanitizer = inject(DomSanitizer);

  private readonly templateKey = signal<string>('');
  protected readonly activeTab = signal<EditorTab>('metadata');
  protected readonly saving = signal(false);

  // Load template
  private readonly _template = rxResource({
    request: this.templateKey,
    loader: ({ request: key }) =>
      key ? this.templateService.read(key) : of(undefined),
  });

  protected readonly template = computed(() => this._template.value());

  // Load or create draft version
  private readonly _versions = rxResource({
    request: this.templateKey,
    loader: ({ request: key }) =>
      key ? this.templateService.listVersions(key) : of([]),
  });

  protected readonly draftVersion = linkedSignal<TemplateVersionModel>(() => {
    const tmpl = this.template();
    const versions = this._versions.value() ?? [];
    if (!tmpl) return newTemplateVersion(1);
    const draft = tmpl.draftVersion;
    if (draft) {
      return versions.find(v => v.version === draft) ?? newTemplateVersion(draft);
    }
    return newTemplateVersion((tmpl.currentVersion ?? 0) + 1);
  });

  protected readonly safePreviewUrl = computed((): SafeResourceUrl | null => {
    const url = this.store.previewUrl();
    return url ? this.sanitizer.bypassSecurityTrustResourceUrl(url) : null;
  });

  constructor() {
    // Read :templateKey from route on init
    effect(() => {
      const key = this.route.snapshot.paramMap.get('templateKey');
      if (key) this.templateKey.set(key);
    }, { allowSignalWrites: true });
  }

  protected onTemplateChange(tmpl: TemplateModel): void {
    this._template['set']?.(tmpl); // update local signal if possible; service update on save
  }

  protected onVersionChange(field: 'html' | 'css', value: string): void {
    const v = safeStructuredClone(this.draftVersion());
    v[field] = value;
    this.draftVersion.set(v);
  }

  protected async saveDraft(): Promise<void> {
    this.saving.set(true);
    try {
      const tmpl = this.template();
      if (tmpl) await this.store.updateTemplate(tmpl);
      await this.store.saveDraft(this.templateKey(), this.draftVersion());
    } finally {
      this.saving.set(false);
    }
  }

  protected async publish(): Promise<void> {
    await this.saveDraft();
    await this.store.openPublishDialog(this.templateKey(), this.draftVersion().version);
  }

  protected async refreshPreview(): Promise<void> {
    const tmpl = this.template();
    await this.store.generatePreview(
      this.templateKey(),
      this.draftVersion(),
      tmpl?.sampleData ?? '{}'
    );
  }

  protected downloadPreview(): void {
    const url = this.store.previewUrl();
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = `preview-${this.templateKey()}.pdf`;
    a.click();
  }
}
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit -p libs/pdf-template/feature/tsconfig.json 2>&1 | head -30
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add libs/pdf-template/feature/src/lib/template-publish.modal.ts libs/pdf-template/feature/src/lib/template-edit.page.ts
git commit -m "feat(pdf-template-feature): TemplateEditPage and TemplatePublishModal"
```

---

## Task 18: Routes, i18n, and project.json

**Files:**
- Create: `libs/pdf-template/feature/src/i18n/de.json`
- Modify: `apps/scs-app/project.json`
- Modify: `apps/scs-app/src/app/app.routes.ts`

- [ ] **Step 1: Create i18n translation file**

```json
// libs/pdf-template/feature/src/i18n/de.json
{
  "list": {
    "title": "Dokumentvorlagen"
  },
  "empty": "Keine Vorlagen gefunden.",
  "delete": {
    "confirm": "Soll diese Vorlage wirklich gelöscht werden?"
  },
  "actionsheet": {
    "edit": "Vorlage bearbeiten",
    "delete": "Vorlage löschen",
    "duplicate": "Vorlage duplizieren",
    "archive": "Vorlage archivieren",
    "preview": "Vorschau"
  },
  "save": {
    "draft": {
      "conf": "Entwurf gespeichert.",
      "error": "Entwurf konnte nicht gespeichert werden."
    }
  },
  "publish": {
    "conf": "Vorlage veröffentlicht.",
    "error": "Veröffentlichung fehlgeschlagen."
  },
  "preview": {
    "error": "Vorschau-Generierung fehlgeschlagen"
  },
  "name": { "label": "Name" },
  "category": { "label": "Kategorie" },
  "language": { "label": "Sprache" },
  "status": { "label": "Status" },
  "version": { "label": "Version" },
  "html": { "label": "HTML" },
  "css": { "label": "CSS" }
}
```

- [ ] **Step 2: Add i18n asset glob to project.json**

In `apps/scs-app/project.json`, inside the `"assets"` array (find where other feature i18n globs are listed, e.g., near the `finance/invoice/feature` entry), add:

```json
{
  "glob": "*.json",
  "input": "libs/pdf-template/feature/src/i18n",
  "output": "./assets/i18n/pdf-template/feature"
},
```

- [ ] **Step 3: Add routes to app.routes.ts**

In `apps/scs-app/src/app/app.routes.ts`, add a templates route entry (near the admin routes section with `isAdminGuard`):

```typescript
{
  path: 'templates',
  canActivate: [isAdminGuard],
  children: [
    {
      path: '',
      loadComponent: () => import('@bk2/pdf-template-feature').then(m => m.TemplateList),
    },
    {
      path: ':templateKey',
      loadComponent: () => import('@bk2/pdf-template-feature').then(m => m.TemplateEditPage),
    },
  ],
},
```

- [ ] **Step 4: Type-check scs-app**

```bash
npx tsc --noEmit -p apps/scs-app/tsconfig.app.json 2>&1 | head -20
```
Expected: no errors.

- [ ] **Step 5: Build scs-app**

```bash
pnpm nx build scs-app 2>&1 | tail -20
```
Expected: Build succeeds.

- [ ] **Step 6: Commit**

```bash
git add libs/pdf-template/feature/src/i18n/de.json apps/scs-app/project.json apps/scs-app/src/app/app.routes.ts
git commit -m "feat: add /templates routes, i18n for pdf-template-feature, register i18n assets"
```

---

## Task 19: Final Type-Check + Build Verification

- [ ] **Step 1: Type-check all new libs**

```bash
npx tsc --noEmit -p libs/pdf-template/util/tsconfig.json 2>&1 | head -10
npx tsc --noEmit -p libs/pdf-template/data-access/tsconfig.json 2>&1 | head -10
npx tsc --noEmit -p libs/pdf-template/ui/tsconfig.json 2>&1 | head -10
npx tsc --noEmit -p libs/pdf-template/feature/tsconfig.json 2>&1 | head -10
```
Expected: 0 errors from each.

- [ ] **Step 2: Build functions**

```bash
pnpm nx build functions --configuration production 2>&1 | tail -10
```
Expected: Build succeeds.

- [ ] **Step 3: Build scs-app**

```bash
pnpm nx build scs-app 2>&1 | tail -10
```
Expected: Build succeeds.

- [ ] **Step 4: Run util tests**

```bash
pnpm run test pdf-template-util 2>&1 | tail -10
```
Expected: All tests pass.

- [ ] **Step 5: Commit final verification**

```bash
git add -A
git commit -m "chore: verify pdf-generator implementation builds and tests pass"
```

---

## Implementation Notes

### FIRESTORE injection token
If `FIRESTORE` is not exported from `@bk2/shared-config`, look for it with:
```bash
grep -r "InjectionToken\|export.*Firestore\|FIRESTORE" libs/shared/config/src/ --include="*.ts" | head -10
```
Use whatever token name the project uses. Alternatively, inject `Firestore` directly from `@angular/fire/firestore` if it's available.

### Rate Limiter custom claims
The rate limiter checks `request.auth.token.admin` and `request.auth.token.contentAdmin`. These must be set as Firebase Auth custom claims for users who hold those roles. If your project stores roles only in Firestore (not as custom claims), adjust `checkRateLimit` in `rate-limiter.ts` to read from Firestore instead.

### AppCheck
The CF uses `enforceAppCheck: true`. During development with the emulator, this is automatically bypassed. For production, ensure App Check is configured in the Angular app.

### CMS Page Print
To use the raw-HTML print mode from a CMS page component, inject `DocGenerationService` and call:
```typescript
const result = await this.docGenService.printHtml(
  document.querySelector('bk-page-content')?.innerHTML ?? '',
  `${pageTitle}.pdf`
);
```
Note: Ionic Shadow DOM styles won't be captured. Add explicit print CSS in the HTML string.

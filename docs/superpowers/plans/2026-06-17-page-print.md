# Page-Print Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the **Print** context-menu item on `content` and `blog` pages generate a polished PDF (default-org logo upper-right, clickable source URL above the title) via the existing `generateDocument` Cloud Function and a new `page-print` Handlebars template.

**Architecture:** Approach A — client-side DOM capture. The page is already rendered in the browser with live section data; `PageStore.print(el)` captures the rendered `bk-section-dispatcher` hosts, inlines computed styles, converts canvases/ECharts to images, skips interactive types, and posts a pre-formatted payload to `generateDocument({ templateId: 'page-print', payload })`. No Cloud Function or Firestore-rule changes.

**Tech Stack:** Angular 20 + NgRx Signals + Ionic 8, Firebase Functions (Puppeteer + Handlebars, already deployed), Vitest. Design: [`2026-06-17-page-print-design.md`](../specs/2026-06-17-page-print-design.md).

---

## File Map

**`libs/cms/page/util/`** (pure, unit-tested helpers)
| File | Responsibility |
|------|----------------|
| `src/lib/page-print.util.ts` | `stripProtocol`, `PRINT_SKIP_SECTION_TYPES`, `isPrintableSectionType`, `PRINT_STYLE_PROPS`, `serializeComputedStyle`, `canvasToImg`, `assemblePagePrintPayload`, `PagePrintSection`, `PagePrintContext`, `PagePrintPayload` types |
| `src/lib/page-print.util.spec.ts` | Unit tests for the above |
| `src/index.ts` | **MODIFY**: re-export `page-print.util` |

**`libs/cms/page/feature/`**
| File | Responsibility |
|------|----------------|
| `src/lib/page-print.service.ts` | `PagePrintService` — DOM capture orchestration (clone, inline styles, canvas→img, build payload) |
| `src/lib/page.store.ts` | **MODIFY**: `print(el)` calls service + `DocGenerationService`, opens URL, `window.print()` fallback |
| `src/lib/content.page.ts` | **MODIFY**: `#printRoot` ref on `<ion-content>`, pass to `store.print()` |
| `src/lib/blog.page.ts` | **MODIFY**: `#printRoot` ref, pass to `store.print()` |
| `tsconfig.json` | **MODIFY**: add `@bk2/pdf-template-data-access` reference |
| `package.json` | **MODIFY**: add `@bk2/pdf-template-data-access` dep |

**`libs/cms/page/util/src/lib/page-i18n.ts`** + **`libs/cms/page/feature/src/i18n/de.json`** — add print toast keys.

**`scripts/templates/page-print.hbs`** — the Handlebars template, seeded as template id `page-print`.

---

## Task 1: Pure print helpers + tests (`cms/page/util`)

**Files:**
- Create: `libs/cms/page/util/src/lib/page-print.util.ts`
- Test: `libs/cms/page/util/src/lib/page-print.util.spec.ts`
- Modify: `libs/cms/page/util/src/index.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// libs/cms/page/util/src/lib/page-print.util.spec.ts
import { describe, it, expect } from 'vitest';
import {
  stripProtocol,
  isPrintableSectionType,
  serializeComputedStyle,
  canvasToImg,
  assemblePagePrintPayload,
  PRINT_STYLE_PROPS,
} from './page-print.util';

describe('stripProtocol', () => {
  it('removes https://', () => {
    expect(stripProtocol('https://seeclub.org/private/x')).toBe('seeclub.org/private/x');
  });
  it('removes http://', () => {
    expect(stripProtocol('http://seeclub.org/a')).toBe('seeclub.org/a');
  });
  it('leaves a protocol-less url unchanged', () => {
    expect(stripProtocol('seeclub.org/a')).toBe('seeclub.org/a');
  });
  it('keeps path and query', () => {
    expect(stripProtocol('https://x.org/a/b?q=1')).toBe('x.org/a/b?q=1');
  });
});

describe('isPrintableSectionType', () => {
  it('returns false for interactive types', () => {
    expect(isPrintableSectionType('chat')).toBe(false);
    expect(isPrintableSectionType('rag')).toBe(false);
    expect(isPrintableSectionType('form')).toBe(false);
    expect(isPrintableSectionType('tracker')).toBe(false);
  });
  it('returns true for printable types', () => {
    expect(isPrintableSectionType('article')).toBe(true);
    expect(isPrintableSectionType('table')).toBe(true);
    expect(isPrintableSectionType('chart')).toBe(true);
  });
});

describe('serializeComputedStyle', () => {
  it('emits the allowlisted properties as inline css', () => {
    const fakeStyle = {
      getPropertyValue: (p: string) => (p === 'color' ? 'rgb(1, 2, 3)' : ''),
    } as unknown as CSSStyleDeclaration;
    const css = serializeComputedStyle(fakeStyle);
    expect(css).toContain('color:rgb(1, 2, 3)');
    // empty values are skipped
    expect(css).not.toContain('font-size:;');
  });
  it('only ever emits known properties', () => {
    const fakeStyle = {
      getPropertyValue: () => 'x',
    } as unknown as CSSStyleDeclaration;
    const css = serializeComputedStyle(fakeStyle);
    for (const decl of css.split(';').filter(Boolean)) {
      const prop = decl.split(':')[0];
      expect(PRINT_STYLE_PROPS).toContain(prop);
    }
  });
});

describe('canvasToImg', () => {
  it('produces an img with the canvas data url as src', () => {
    const canvas = {
      toDataURL: () => 'data:image/png;base64,AAAA',
      width: 300,
      height: 150,
    } as unknown as HTMLCanvasElement;
    const img = canvasToImg(canvas, document);
    expect(img.tagName).toBe('IMG');
    expect(img.getAttribute('src')).toBe('data:image/png;base64,AAAA');
  });
});

describe('assemblePagePrintPayload', () => {
  it('merges context and sections into the payload shape', () => {
    const payload = assemblePagePrintPayload(
      {
        pageTitle: 'My Page',
        pageSubtitle: 'sub',
        orgName: 'Seeclub',
        logoUrl: 'https://img/logo.svg',
        sourceUrl: 'https://seeclub.org/private/p1',
        printedDate: '17.06.2026',
      },
      [{ title: 'Intro', html: '<p>hi</p>' }],
    );
    expect(payload.pageTitle).toBe('My Page');
    expect(payload.sourceUrl).toBe('https://seeclub.org/private/p1');
    expect(payload.sourceUrlLabel).toBe('seeclub.org/private/p1');
    expect(payload.sections).toHaveLength(1);
    expect(payload.sections[0].html).toBe('<p>hi</p>');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm run test cms-page-util`
Expected: FAIL — `Cannot find module './page-print.util'`.

- [ ] **Step 3: Implement the helpers**

```typescript
// libs/cms/page/util/src/lib/page-print.util.ts
import { SectionType } from '@bk2/shared-models';

/** Section types that cannot be meaningfully rendered into a static PDF. */
export const PRINT_SKIP_SECTION_TYPES: SectionType[] = ['chat', 'rag', 'form', 'tracker'];

export function isPrintableSectionType(type: SectionType): boolean {
  return !PRINT_SKIP_SECTION_TYPES.includes(type);
}

/** Remove a leading http:// or https:// from a url for display. */
export function stripProtocol(url: string): string {
  return url.replace(/^https?:\/\//i, '');
}

/** Curated set of computed-style properties copied onto captured nodes. */
export const PRINT_STYLE_PROPS: string[] = [
  'color', 'background-color',
  'font-family', 'font-size', 'font-weight', 'font-style', 'line-height',
  'text-align', 'text-decoration', 'vertical-align',
  'margin', 'padding', 'border', 'border-radius',
  'display', 'width', 'height', 'max-width', 'list-style',
];

/** Serialize the allowlisted computed-style properties to an inline css string. */
export function serializeComputedStyle(style: CSSStyleDeclaration): string {
  let css = '';
  for (const prop of PRINT_STYLE_PROPS) {
    const value = style.getPropertyValue(prop);
    if (value && value.trim().length > 0) {
      css += `${prop}:${value};`;
    }
  }
  return css;
}

/** Convert a <canvas> (e.g. an ECharts render) to an <img> with a data-url src. */
export function canvasToImg(canvas: HTMLCanvasElement, doc: Document): HTMLImageElement {
  const img = doc.createElement('img');
  img.setAttribute('src', canvas.toDataURL('image/png'));
  img.style.maxWidth = '100%';
  if (canvas.width) img.style.width = `${canvas.width}px`;
  return img;
}

export interface PagePrintSection {
  title: string;
  html: string;
}

export interface PagePrintContext {
  pageTitle: string;
  pageSubtitle: string;
  orgName: string;
  logoUrl: string;
  sourceUrl: string;
  printedDate: string;
}

export interface PagePrintPayload extends PagePrintContext {
  sourceUrlLabel: string;
  sections: PagePrintSection[];
}

/** Build the pre-formatted payload handed to the page-print Handlebars template. */
export function assemblePagePrintPayload(
  ctx: PagePrintContext,
  sections: PagePrintSection[],
): PagePrintPayload {
  return {
    ...ctx,
    sourceUrlLabel: stripProtocol(ctx.sourceUrl),
    sections,
  };
}
```

- [ ] **Step 4: Re-export from the util index**

In `libs/cms/page/util/src/index.ts`, add at the end:
```typescript
export * from './lib/page-print.util';
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm run test cms-page-util`
Expected: PASS (all `page-print.util` tests green).

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit -p libs/cms/page/util/tsconfig.json`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add libs/cms/page/util/src/lib/page-print.util.ts libs/cms/page/util/src/lib/page-print.util.spec.ts libs/cms/page/util/src/index.ts
git commit -m "feat(cms-page-util): page-print pure helpers (stripProtocol, payload assembly, style/canvas capture)"
```

---

## Task 2: `page-print.hbs` template

**Files:**
- Create: `scripts/templates/page-print.hbs`

- [ ] **Step 1: Write the template**

```handlebars
<!DOCTYPE html>
{{!--
  Page Print — renders a CMS content/blog page to PDF.
  Caller pre-formats all values (Approach A: client-side DOM capture).
  Context:
  {
    "pageTitle":      "Page title",
    "pageSubtitle":   "optional subtitle",
    "orgName":        "Seeclub Stäfa",
    "logoUrl":        "https://…imgix…/tenant/scs/logo/logo_round.svg",
    "sourceUrl":      "https://seeclub.org/private/…",  // link target
    "sourceUrlLabel": "seeclub.org/private/…",          // protocol-less display
    "printedDate":    "17.06.2026",
    "sections":       [ { "title": "…", "html": "<…captured markup…>" } ]
  }
  Note: page numbers are intentionally omitted — they require Puppeteer's
  footerTemplate, which generateDocument does not expose. The fixed footer
  (orgName + printedDate) repeats on every page (Chromium repeats fixed elements).
--}}
<html lang="de">
<head>
<meta charset="utf-8">
<style>
  @page { size: A4; margin: 22mm 18mm 20mm 18mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: Helvetica, Arial, sans-serif;
    color: #1a1a1a;
    font-size: 11pt;
    line-height: 1.45;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  /* fixed logo — repeated top-right on every page */
  .print-logo {
    position: fixed;
    top: 0;
    right: 0;
    width: 20mm;
    height: auto;
  }

  /* fixed footer — repeated on every page */
  .print-footer {
    position: fixed;
    bottom: -14mm;
    left: 0;
    right: 0;
    font-size: 8pt;
    color: #6b6b6b;
    display: flex;
    justify-content: space-between;
    border-top: 0.3pt solid #cfcfcf;
    padding-top: 2mm;
  }

  .source {
    font-size: 8.5pt;
    color: #6b6b6b;
    margin-bottom: 2mm;
  }
  .source a { color: #1d70b8; text-decoration: none; }

  h1.page-title { font-size: 20pt; margin: 0 0 1mm 0; color: #1a1a1a; }
  .page-subtitle { font-size: 12pt; color: #555; margin: 0 0 6mm 0; }

  .print-section { margin-bottom: 6mm; break-inside: avoid; page-break-inside: avoid; }
  .print-section h2 { font-size: 14pt; margin: 0 0 2mm 0; color: #1d70b8; }
  .print-section img { max-width: 100%; height: auto; }
  .print-section table { border-collapse: collapse; width: 100%; }
</style>
</head>
<body>
  <img class="print-logo" src="{{logoUrl}}" alt="{{orgName}}">

  <header>
    {{#if sourceUrl}}
      <div class="source">Quelle: <a href="{{sourceUrl}}">{{sourceUrlLabel}}</a></div>
    {{/if}}
    <h1 class="page-title">{{pageTitle}}</h1>
    {{#if pageSubtitle}}<div class="page-subtitle">{{pageSubtitle}}</div>{{/if}}
  </header>

  <main>
    {{#each sections}}
      <section class="print-section">
        {{#if title}}<h2>{{title}}</h2>{{/if}}
        {{{html}}}
      </section>
    {{/each}}
  </main>

  <footer class="print-footer">
    <span>{{orgName}}</span>
    <span>{{printedDate}}</span>
  </footer>
</body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add scripts/templates/page-print.hbs
git commit -m "feat(templates): page-print.hbs (logo upper-right, clickable source url, section blocks)"
```

> **Seeding happens in Task 7** (`node scripts/seed-template.mjs page-print`).

---

## Task 3: i18n keys for print feedback

**Files:**
- Modify: `libs/cms/page/util/src/lib/page-i18n.ts`
- Modify: `libs/cms/page/feature/src/i18n/de.json`

- [ ] **Step 1: Add keys to `PAGE_I18N_KEYS`**

In `libs/cms/page/util/src/lib/page-i18n.ts`, inside the `PAGE_I18N_KEYS` object (next to `error_save` / `error_load`), add:
```typescript
  print_generating:             PFX + 'print.generating',
  print_error:                  PFX + 'print.error',
  print_empty:                  PFX + 'print.empty',
```

- [ ] **Step 2: Add the German strings**

In `libs/cms/page/feature/src/i18n/de.json`, locate the JSON node for this scope (the object whose keys are referenced via `@cms/page/feature.`) and add (matching the nesting already used for e.g. `error.load`):
```json
"print": {
  "generating": "PDF wird erstellt …",
  "error": "Das PDF konnte nicht erstellt werden. Es wird der Browser-Druck verwendet.",
  "empty": "Diese Seite enthält keine druckbaren Abschnitte."
}
```

> If `de.json` uses a flat dotted-key style instead of nested objects, add the three keys in that style instead: `"print.generating"`, `"print.error"`, `"print.empty"`. Match the file's existing convention.

- [ ] **Step 3: Type-check the util lib**

Run: `npx tsc --noEmit -p libs/cms/page/util/tsconfig.json`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add libs/cms/page/util/src/lib/page-i18n.ts libs/cms/page/feature/src/i18n/de.json
git commit -m "feat(cms-page): i18n keys for print generation feedback"
```

---

## Task 4: Add pdf-template-data-access dependency to cms-page-feature

**Files:**
- Modify: `libs/cms/page/feature/package.json`
- Modify: `libs/cms/page/feature/tsconfig.json`

- [ ] **Step 1: Add the package dependency**

In `libs/cms/page/feature/package.json`, add to `dependencies` (after the other `@bk2/*` entries):
```json
"@bk2/pdf-template-data-access": "*"
```

- [ ] **Step 2: Add the tsconfig project reference**

In `libs/cms/page/feature/tsconfig.json`, add to the `references` array:
```json
{ "path": "../../../pdf-template/data-access/tsconfig.lib.json" }
```

- [ ] **Step 3: Verify the alias resolves**

Run: `grep -n "pdf-template-data-access" tsconfig.base.json`
Expected: one line mapping `@bk2/pdf-template-data-access` to `libs/pdf-template/data-access/src/index.ts` (already present from the pdf-generator work).

- [ ] **Step 4: Commit**

```bash
git add libs/cms/page/feature/package.json libs/cms/page/feature/tsconfig.json
git commit -m "chore(cms-page-feature): depend on @bk2/pdf-template-data-access"
```

---

## Task 5: `PagePrintService` (DOM capture orchestration)

**Files:**
- Create: `libs/cms/page/feature/src/lib/page-print.service.ts`

- [ ] **Step 1: Implement the service**

```typescript
// libs/cms/page/feature/src/lib/page-print.service.ts
import { Injectable } from '@angular/core';
import { SectionModel } from '@bk2/shared-models';
import {
  PagePrintContext,
  PagePrintPayload,
  PagePrintSection,
  assemblePagePrintPayload,
  isPrintableSectionType,
  serializeComputedStyle,
  canvasToImg,
} from '@bk2/cms-page-util';

/**
 * Builds the page-print payload from the already-rendered page DOM (Approach A).
 * It walks the rendered `bk-section-dispatcher` hosts inside `root`, pairs them
 * with the ordered visible sections, captures each printable section's markup
 * (computed styles inlined, canvases converted to images, scripts stripped),
 * and assembles the pre-formatted payload for the `page-print` template.
 */
@Injectable({ providedIn: 'root' })
export class PagePrintService {

  public buildPayload(
    root: HTMLElement,
    visibleSections: SectionModel[],
    ctx: PagePrintContext,
  ): PagePrintPayload {
    const hosts = Array.from(root.querySelectorAll('bk-section-dispatcher'));
    const sections: PagePrintSection[] = [];

    hosts.forEach((host, i) => {
      const model = visibleSections[i];
      if (!model || !isPrintableSectionType(model.type)) return;
      const html = this.captureSectionHtml(host as HTMLElement);
      if (html.trim().length === 0) return;
      sections.push({ title: model.title ?? '', html });
    });

    return assemblePagePrintPayload(ctx, sections);
  }

  /** Clone a section host, inline computed styles, convert canvases, strip scripts. */
  private captureSectionHtml(hostEl: HTMLElement): string {
    const clone = hostEl.cloneNode(true) as HTMLElement;
    this.inlineStylesDeep(hostEl, clone);
    this.replaceCanvases(hostEl, clone);
    clone.querySelectorAll('script').forEach(el => el.remove());
    return clone.innerHTML;
  }

  /** Copy computed styles from each original element onto the matching clone. */
  private inlineStylesDeep(original: HTMLElement, clone: HTMLElement): void {
    const originals = [original, ...Array.from(original.querySelectorAll<HTMLElement>('*'))];
    const clones = [clone, ...Array.from(clone.querySelectorAll<HTMLElement>('*'))];
    for (let i = 0; i < originals.length && i < clones.length; i++) {
      const css = serializeComputedStyle(window.getComputedStyle(originals[i]));
      const existing = clones[i].getAttribute('style') ?? '';
      clones[i].setAttribute('style', existing + css);
    }
  }

  /** Replace each <canvas> in the clone with an <img> snapshot of the original. */
  private replaceCanvases(original: HTMLElement, clone: HTMLElement): void {
    const origCanvases = Array.from(original.querySelectorAll('canvas'));
    const cloneCanvases = Array.from(clone.querySelectorAll('canvas'));
    for (let i = 0; i < origCanvases.length && i < cloneCanvases.length; i++) {
      try {
        const img = canvasToImg(origCanvases[i] as HTMLCanvasElement, document);
        cloneCanvases[i].replaceWith(img);
      } catch {
        cloneCanvases[i].remove(); // tainted/empty canvas — best-effort
      }
    }
  }
}
```

- [ ] **Step 2: Type-check the feature lib**

Run: `npx tsc --noEmit -p libs/cms/page/feature/tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add libs/cms/page/feature/src/lib/page-print.service.ts
git commit -m "feat(cms-page-feature): PagePrintService — capture rendered section DOM for PDF"
```

---

## Task 6: Rewire `PageStore.print()` to generate the PDF

**Files:**
- Modify: `libs/cms/page/feature/src/lib/page.store.ts`

- [ ] **Step 1: Add imports**

At the top of `libs/cms/page/feature/src/lib/page.store.ts`:
- Add `ToastController` to the existing `@ionic/angular/standalone` import:
  ```typescript
  import { AlertController, ModalController, ToastController } from '@ionic/angular/standalone';
  ```
- Add `getTodayStr, DateFormat` to the `@bk2/shared-util-core` import (keep the existing names):
  ```typescript
  import { chipMatches, debugItemLoaded, debugListLoaded, debugMessage, die, nameMatches, getImgixUrlWithAutoParams, debugData, getTodayStr, DateFormat } from '@bk2/shared-util-core';
  ```
- Add `error` to the `@bk2/shared-util-angular` import:
  ```typescript
  import { bkPrompt, confirm, downloadTextFile, error, exportCsv, getExportFileName, navigateByUrl } from '@bk2/shared-util-angular';
  ```
- Add two new imports:
  ```typescript
  import { DocGenerationService } from '@bk2/pdf-template-data-access';
  import { PagePrintService } from './page-print.service';
  ```

- [ ] **Step 2: Inject the new providers**

In the first `withProps(() => ({ … }))` block (the one injecting `appStore`, `pageService`, …), add:
```typescript
    toastController: inject(ToastController),
    docGenerationService: inject(DocGenerationService),
    pagePrintService: inject(PagePrintService),
```

- [ ] **Step 3: Replace the `print` method**

Replace the existing `print` method:
```typescript
      async print(): Promise<void> {
        store.page() ?? die('PageStore.print: page is mandatory.');
        window.print();
      },
```
with:
```typescript
      /**
       * Generate a PDF of the current page via the page-print template, using
       * client-side DOM capture of the rendered sections. `root` is the page
       * content element holding the rendered <bk-section-dispatcher> hosts.
       * On any failure, falls back to the browser's native print dialog.
       */
      async print(root?: HTMLElement): Promise<void> {
        const page = store.page() ?? die('PageStore.print: page is mandatory.');
        const sections = store.pageSections().filter(s => s.state === 'published' || store.appStore.currentUser() !== undefined);

        if (!root || sections.length === 0) {
          if (sections.length === 0) error(store.toastController, store.i18n.print_empty());
          window.print();
          return;
        }

        const appConfig = store.appStore.appConfig();
        const logoUrl = `${store.appStore.services.imgixBaseUrl()}/${getImgixUrlWithAutoParams(appConfig.logoUrl)}`;
        const sourceUrl = typeof window !== 'undefined' ? window.location.href : '';

        const payload = store.pagePrintService.buildPayload(root, sections, {
          pageTitle: page.title?.length ? page.title : page.name,
          pageSubtitle: '',
          orgName: appConfig.appName,
          logoUrl,
          sourceUrl,
          printedDate: getTodayStr(DateFormat.viewDate),
        });

        try {
          const result = await store.docGenerationService.generate({
            templateId: 'page-print',
            payload: payload as unknown as Record<string, unknown>,
            options: {
              outputFormat: 'pdf',
              storageMode: 'ephemeral',
              filename: `${page.name || 'page'}.pdf`,
            },
          });
          if (typeof window !== 'undefined') window.open(result.url, '_blank');
        } catch (e) {
          debugMessage(`PageStore.print: generation failed: ${e}`, store.currentUser());
          error(store.toastController, store.i18n.print_error());
          window.print();
        }
      },
```

> `DateFormat.viewDate` yields `DD.MM.YYYY`. If the enum member is named differently in this codebase, use the member that produces the Swiss `DD.MM.YYYY` view format (grep `enum DateFormat` in `@bk2/shared-util-core`).

- [ ] **Step 4: Type-check the feature lib**

Run: `npx tsc --noEmit -p libs/cms/page/feature/tsconfig.json`
Expected: no errors. (If `DateFormat.viewDate` is wrong, fix per the note above.)

- [ ] **Step 5: Commit**

```bash
git add libs/cms/page/feature/src/lib/page.store.ts
git commit -m "feat(cms-page): generate page PDF via page-print template instead of window.print"
```

---

## Task 7: Wire page components to pass the rendered container

**Files:**
- Modify: `libs/cms/page/feature/src/lib/content.page.ts`
- Modify: `libs/cms/page/feature/src/lib/blog.page.ts`

- [ ] **Step 1: content.page.ts — add a ref to the content element**

Add `ElementRef` to the `@angular/core` import:
```typescript
import { Component, computed, effect, ElementRef, inject, input, signal, viewChild } from '@angular/core';
```
Add the template ref on the **main** `<ion-content class="ion-no-padding">` (NOT the popover's `<ion-content>`):
```html
    <ion-content class="ion-no-padding" #printRoot>
```
Add the viewChild near the existing `ionContent` viewChild:
```typescript
  private printRoot = viewChild<ElementRef<HTMLElement>>('printRoot');
```

- [ ] **Step 2: content.page.ts — pass the element to print**

In `onPopoverDismiss`, change:
```typescript
      case 'print': await this.store.print(); break;
```
to:
```typescript
      case 'print': await this.store.print(this.printRoot()?.nativeElement); break;
```

- [ ] **Step 3: blog.page.ts — same wiring**

Ensure `ElementRef` is imported from `@angular/core` (add it if missing). Add a template ref to the main content container that wraps the rendered sections (the element that contains the `<bk-section-dispatcher>` hosts — e.g. the `<ion-content>` or the `.print-content` div):
```html
#printRoot
```
Add the viewChild:
```typescript
  private printRoot = viewChild<ElementRef<HTMLElement>>('printRoot');
```
And change:
```typescript
      case 'print':         await this.store.print(); break;
```
to:
```typescript
      case 'print':         await this.store.print(this.printRoot()?.nativeElement); break;
```

- [ ] **Step 4: Type-check the feature lib**

Run: `npx tsc --noEmit -p libs/cms/page/feature/tsconfig.json`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add libs/cms/page/feature/src/lib/content.page.ts libs/cms/page/feature/src/lib/blog.page.ts
git commit -m "feat(cms-page): pass rendered content element to PageStore.print"
```

---

## Task 8: Build, seed template, manual verification

**Files:** none (verification + seeding)

- [ ] **Step 1: Run the util tests**

Run: `pnpm run test cms-page-util`
Expected: PASS.

- [ ] **Step 2: Build the feature lib**

Run: `pnpm nx build cms-page-feature 2>&1 | tail -20`
Expected: build succeeds.

- [ ] **Step 3: Seed the template to Firestore**

Run: `node scripts/seed-template.mjs page-print`
Follow the prompts (sample-data values may be left empty/placeholder; metadata: tenant = your tenant id, name = "Seite drucken", category = `report`, language = `de`, output format = `pdf`, orientation = `portrait`). This writes `templates/page-print` + version 1.
Expected: "template page-print … written" confirmation.

> Requires `gcloud auth application-default login` (or `GOOGLE_APPLICATION_CREDENTIALS`).

- [ ] **Step 4: Manual verification (serve the app)**

Run: `pnpm nx serve scs-app` (after the usual `source ./apps/scs-app/.env && ts-node ./set-env.js`).
1. Open a `content` page that has several sections (text + a table + a chart).
2. Open the context menu → **Print**.
3. Verify: a new tab opens with the generated PDF showing the default-org logo in the upper-right corner, "Quelle: <clickable url-without-protocol>" above the title, the page title, and the section content. The source link is clickable in the PDF.
4. Repeat on a `blog` page.
5. Trigger a failure (e.g. offline) and confirm it falls back to the browser print dialog and shows the error toast.

- [ ] **Step 5: Update the implementation TOC**

Mark the page-print design as implemented in `docs/PENDING_IMPLEMENTATION.md` (add/advance its entry per the authoring-docs convention), if it has an entry.

- [ ] **Step 6: Commit any verification fixes**

```bash
git add -A
git commit -m "chore(cms-page): finalize page-print after manual verification"
```

---

## Self-Review Notes

- **Spec coverage:** logo upper-right (Task 2 template), clickable protocol-less source URL (Tasks 1 `stripProtocol` + 2 template + 6 payload), DOM capture incl. charts→images and interactive-type skip (Tasks 1+5), `templateId: 'page-print'` call + ephemeral mode + window.print fallback (Task 6), blog+content wiring (Task 7), tests (Task 1), seeding/no-CF-change (Task 8). All covered.
- **Type consistency:** `PagePrintContext` / `PagePrintSection` / `PagePrintPayload`, `buildPayload(root, visibleSections, ctx)`, `assemblePagePrintPayload(ctx, sections)`, `serializeComputedStyle(style)`, `canvasToImg(canvas, doc)`, `stripProtocol(url)`, `isPrintableSectionType(type)` are referenced consistently across Tasks 1, 5, 6.
- **Deviation from design:** footer carries orgName + printedDate (fixed-position, repeats per page) rather than page numbers, because page numbers need Puppeteer's `footerTemplate`, which `generateDocument` does not expose and is out of scope.

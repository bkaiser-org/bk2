# Page-Print Feature — Design

**Date:** 2026-06-17
**Status:** approved, ready for implementation plan

## Goal

Turn the **Print** context-menu item on `content` and `blog` pages into a polished
PDF export. Today `PageStore.print()` calls `window.print()` (browser-native,
driven by a `@media print` stylesheet). The new behaviour generates a PDF through
the already-deployed `generateDocument` Cloud Function, rendered from a new
`page-print` Handlebars template that shows the **default-org logo in the
upper-right corner** and a clickable **source URL** above the page title.

This is rendering **everything best-effort** via **client-side DOM capture**
(Approach A): the page is already rendered in the browser with live section data,
so we capture that DOM rather than re-render server-side.

## Non-goals (YAGNI)

- **No Cloud Function changes.** Reuses the deployed `generateDocument` CF and the
  `DocGenerationService` Angular wrapper as-is.
- **No new Firestore rules.** Template-read rules already permit reading
  `templates/{id}` for authenticated users.
- **No model-driven per-type serializer.** We capture rendered DOM, not section models.
- Faithful rendering of interactive section types (`chat`, `rag`, `form`, `tracker`)
  is out of scope — they are skipped with a small placeholder note.
- Maps / iframes are best-effort and may render blank in the PDF — acceptable.

## Architecture

```
Context menu "Print"
  → onPopoverDismiss('print')           (content.page.ts / blog.page.ts)
  → store.print(containerEl)            (PageStore)
      → PagePrintService.buildPayload(containerEl, visibleSections, ctx)
            · capture rendered section DOM (Approach A)
      → DocGenerationService.generate({ templateId: 'page-print', payload, options })
      → opens returned signed URL  (fallback: window.print() on failure)
  → generateDocument CF renders page-print.hbs via Puppeteer
```

## Components

### 1. `scripts/templates/page-print.hbs` (new)

The Handlebars template, seeded to Firestore as template id **`page-print`** via the
existing generic seeder: `node scripts/seed-template.mjs page-print`
(file name without `.hbs` becomes the template id).

Layout:

- A4 portrait, base typography CSS (Helvetica/Arial, `print-color-adjust: exact`),
  page-break rules (`break-inside: avoid` on section blocks).
- **Fixed top-right logo** (`{{logoUrl}}`, ~20 mm wide) — `position: fixed; top; right`
  so Puppeteer repeats it on every page.
- Header block (top-left), above the title in small muted text:
  `Quelle: <a href="{{sourceUrl}}">{{sourceUrlLabel}}</a>` — a live, clickable link
  in the PDF, displayed without the protocol.
- Page title `{{pageTitle}}`, optional subtitle `{{pageSubtitle}}`, and `{{printedDate}}`.
- Footer with page numbers.
- Body iterates the sections:
  ```handlebars
  {{#each sections}}
    <section class="print-section">
      {{#if title}}<h2>{{title}}</h2>{{/if}}
      {{{html}}}   {{!-- triple-stache: html is pre-sanitized captured markup --}}
    </section>
  {{/each}}
  ```

The template is logic-free: all values arrive pre-formatted (matching the existing
`gss-*` templates' convention). No new Handlebars helpers required.

### 2. Payload contract

Assembled client-side; passed to `generateDocument` as `payload`.

```jsonc
{
  "pageTitle":      "…",                       // page.title || page.name
  "pageSubtitle":   "…",                       // optional
  "orgName":        "…",                       // appConfig org / tenant name
  "logoUrl":        "https://…imgix…/tenant/scs/logo/logo_round.svg",
  "sourceUrl":      "https://seeclub.org/private/…",   // window.location.href (href target)
  "sourceUrlLabel": "seeclub.org/private/…",           // sourceUrl without protocol (display)
  "printedDate":    "17.06.2026",              // formatted DD.MM.YYYY
  "sections": [
    { "title": "…", "html": "<…captured, style-inlined markup…>" }
  ]
}
```

### 3. `PagePrintService` (new — `libs/cms/page/feature`)

DOM capture orchestration (needs the browser DOM + `getComputedStyle`):

- Resolve the ordered rendered `bk-section-dispatcher` host elements within the
  page-content container, paired with `visibleSections()` for section titles.
- Per section element:
  - clone the node;
  - inline computed styles onto the clone (so the standalone PDF render keeps layout);
  - convert `<canvas>` / ECharts instances to `<img>` data-URLs;
  - strip `<script>` and interactive controls;
  - skip denylisted types (`chat`, `rag`, `form`, `tracker`) — emit a short
    placeholder note instead of the live widget;
- assemble the payload (title/subtitle/org/logo/source/printedDate + `sections[]`).

Pure, testable helpers live in `libs/cms/page/util` (see §5):
`stripProtocol`, `isPrintableSectionType` (denylist), `serializeComputedStyle`,
`canvasToImg`, `assemblePagePrintPayload`. The service is the thin DOM-driven shell.

### 4. `PageStore.print(containerEl)` — modify

Replaces the `window.print()` body:

- Build payload via `PagePrintService.buildPayload(containerEl, visibleSections, ctx)`.
- `logoUrl` = `imgixBaseUrl + '/' + getImgixUrlWithAutoParams(appConfig.logoUrl)`.
- `orgName` from appConfig; `sourceUrl` = `window.location.href`;
  `sourceUrlLabel` = `stripProtocol(sourceUrl)`.
- Call `DocGenerationService.generate({ templateId: 'page-print', payload,
  options: { outputFormat: 'pdf', storageMode: 'ephemeral', filename } })`
  (ephemeral → skips the CF rate-limiter, no audit doc).
- Open the returned signed `url` (new tab / `pdf-preview.modal`).
- On failure (offline, CF error): error toast + fall back to `window.print()`.
- Empty page: info toast, no-op.

New dependency: `@bk2/pdf-template-data-access` added to
`libs/cms/page/feature` (package.json + tsconfig references).

### 5. Wiring in page components

- `content.page.ts` and `blog.page.ts`: their `onPopoverDismiss` already routes
  `'print'` → `store.print()`. Add a `viewChild` ref to the rendered content
  container and pass it: `store.print(this.printContainer())`.
- Capture works in both reader and admin/edit views by iterating the rendered
  `bk-section-dispatcher` hosts in document order.

## Error handling

| Case | Behaviour |
|------|-----------|
| Generation fails / offline | error toast + `window.print()` fallback |
| Empty page (no visible sections) | info toast, no PDF |
| Denylisted/interactive section | placeholder note in PDF |
| Map / iframe renders blank | accepted (best-effort) |

## Testing

Vitest (jsdom) in `libs/cms/page/util`:

- `stripProtocol` — `https://`, `http://`, no-protocol, trailing path/query.
- `isPrintableSectionType` — denylist members vs. printable types.
- `assemblePagePrintPayload` — builds the payload shape from a section list + ctx.
- `canvasToImg` — converts a mock canvas to a data-URL `<img>`.
- `serializeComputedStyle` — copies a mock node's computed styles to an inline style string.

## Seeding & deployment

1. Add `scripts/templates/page-print.hbs`.
2. `node scripts/seed-template.mjs page-print` (writes `templates/page-print` + version 1).
3. No CF redeploy, no rules deploy.
4. App build picks up the new lib code and store wiring.

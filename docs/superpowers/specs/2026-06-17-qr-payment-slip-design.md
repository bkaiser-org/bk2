# QR Payment Slip — Appended Second Page for Generated Documents

**Date:** 2026-06-17
**Status:** Design approved, ready for implementation plan
**Related:** [`2026-05-25-pdf-generator.md`](../plans/2026-05-25-pdf-generator.md), [`firebase-deploy` skill]

## Goal

Optionally append a **Swiss QR-bill payment slip** as a second page to a generated
document (PDF). The payee (creditor) is the current organisation; the payer
(debtor) is the recipient whose address is in the generation payload. Two
template-level switches control it:

- **Attach QR slip** — on/off.
- **Include amount** — when on, the slip carries the payload amount; when off, the
  amount is left blank so the payer can fill in / raise it (e.g. donations).

## Decisions (resolved during brainstorming)

| # | Decision |
|---|----------|
| 1 | Config lives **on the template** (`TemplateModel`), not per-generation. Requires a shared-models schema change (approved). |
| 2 | Payee data is resolved **server-side** from the org — not passed through the payload, not hardcoded. |
| 3 | Render the slip as an **SVG second page** injected into the HTML (Puppeteer renders it). No PDFKit / PDF-merge step. |
| 4 | Amount comes from the payload **`amount`** field (parsed from the Swiss-formatted string). |
| 5 | **No QR reference** (reference type `NON`) for now — structured references are a future addition. |
| 6 | Expose `{{payee.*}}` to the Handlebars context and **migrate both existing templates' footers** to use it, so footer and slip read one source. |

## Data model change (shared-models)

Add two fields to `TemplateModel` (`libs/shared/models/src/lib/pdf-template.model.ts`):

```ts
public attachQrSlip = false;       // append a QR payment slip as a second page
public qrSlipWithAmount = false;   // fill the slip amount from payload.amount
```

Both default `false` (existing templates and `newTemplate()` are unaffected).

## Payee resolution (server-side, `generateDocument`, template mode only)

Resolved once per generation when `attachQrSlip` is true:

1. `tenantId` (from auth token) → read `AppConfig` (doc id = `tenantId`) → `ownerOrgId`.
2. Read `OrgModel(ownerOrgId)` → `name`.
3. Query `addresses` where `parentKey == "org.{ownerOrgId}"`, `isFavorite == true`:
   - `addressChannel == bankaccount` → `iban`.
   - favorite postal address → `streetName`, `streetNumber`, `zipCode`, `city`, `countryCode`.

Produces a `payee` object:

```ts
interface Payee {
  name: string;
  iban: string;
  street: string;        // streetName
  buildingNumber: string;// streetNumber
  zip: string;
  city: string;
  country: string;       // countryCode, default 'CH'
}
```

The `payee` is (a) used to build the QR creditor and (b) merged into the Handlebars
render context as `payee` so templates can reference `{{payee.iban}}` etc.

Error handling: if `attachQrSlip` is on but no favorite bankaccount IBAN is found,
throw `HttpsError('failed-precondition', 'No payee IBAN configured for organisation')`.

## Debtor & amount mapping (from payload)

| QR field | Source |
|----------|--------|
| debtor name | `payload.firstName` + ' ' + `payload.lastName` |
| debtor address | `payload.streetName`, `payload.streetNumber`, `payload.zipCode`, `payload.city` |
| debtor country | `payload.countryCode` (default `CH`) |
| amount | when `qrSlipWithAmount`: `parseSwissAmount(payload.amount)` → number; else omitted |
| currency | `CHF` |
| reference | none (`NON`) |

`parseSwissAmount` strips the Swiss thousands apostrophe (`1'000.00` → `1000.00`).
If the debtor address is incomplete the slip still renders (debtor is optional on a
QR-bill); only a valid creditor IBAN + currency are mandatory.

## Rendering — SVG second page

1. After Handlebars produces `htmlToRender` (template mode), and `attachQrSlip` is on:
2. Build the swissqrbill `Data` (creditor = payee, debtor, amount, currency `CHF`).
3. Generate the slip SVG via `swissqrbill/svg`.
4. Append a second A4 page to the HTML: a `<div>` with `page-break-before: always`
   that pins the slip SVG to the bottom 105 mm of the page (the standard payment-part
   position).
5. Puppeteer renders the combined HTML to a single multi-page PDF — no merge step.

The slip is only appended in **template mode** (not raw-HTML mode), where network is
already allowed for asset URLs; the SVG itself is inline (no network).

## Footer migration (both existing templates)

The donation-confirmation and membership-fee-invoice templates currently hardcode the
org IBAN/address in their footers. Replace those with `{{payee.iban}}`,
`{{payee.name}}`, `{{payee.street}}`, `{{payee.buildingNumber}}`, `{{payee.zip}}`,
`{{payee.city}}`. Update the `.hbs` sources in `scripts/templates/` and re-seed the
Firestore versions. Exact template IDs confirmed at implementation time.

## Editor UI

In the **Metadaten** tab of `template-edit.page.ts`, add two `ion-checkbox`es wired
through the existing `onTemplateFieldChange`:

- "QR-Einzahlungsschein anhängen" → `attachQrSlip`.
- "Betrag im Einzahlungsschein ausfüllen" → `qrSlipWithAmount`, **disabled unless**
  `attachQrSlip` is on.

Both respect the existing `readOnly()` view mode.

## Testing

- Unit-test `parseSwissAmount` (apostrophe, plain, empty, invalid) in pdf-template util.
- Unit-test the payee-resolution helper (favorite selection, missing IBAN) in functions.
- Manual: generate with slip off (1 page), on without amount (blank-amount slip), on
  with amount (filled slip); verify footer == slip IBAN on both templates.

## Out of scope / future

- Structured QR references (QRR/SCOR) and QR-IBAN handling.
- Per-generation override of the template's QR settings.
- Non-CHF currencies.

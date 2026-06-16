# Booking Counterparty & Config-Driven Booking Actions — Design

**Date:** 2026-06-16
**Status:** approved (design), pending implementation plan

## Problem

A `BookingModel` records a double-entry transaction (`title`, `date`, `accountingTenantId`, plus
`BookingLineModel`s holding the amounts in Rappen). It has **no reference to the external party**
of the transaction.

For an invoice this party already exists as `InvoiceModel.receiver` (the Rechnungsempfänger). But
some bookings have no invoice: e.g. a **Spende**, where we simply receive a bank **Gutschrift** and
book it directly to a revenue account (gss / account `3407`). At booking time we need to capture the
**sender of the Gutschrift** so we can later issue a donation receipt (*Gönnerbestätigung*).

Two needs follow:

1. **An accounting-model gap** — a booking must be able to carry its counterparty (donor / Gutschrift
   sender / any external party), whether inherited from an invoice or entered at booking time.
2. **A config-driven action** — on the booking list, offer *Gönnerbestätigung erstellen* only for
   `accountingTenantId = 'gss'` and account `3407`, generating a PDF from a Handlebars template. This
   should generalise: a configurable mapping of `(accountingTenantId, account) → action`, where the
   set of action *types* can grow (document generation today; e.g. "open a task to a responsible"
   later).

## Decisions (approved)

- **Counterparty model** — add `counterparty: AvatarInfo | undefined` to `BookingModel`, mirroring
  `InvoiceModel.receiver`. `AvatarInfo` already denormalises a Person **or** Org (`modelType`,
  `key`, `name1`/`name2`). *(Approved schema change in `shared-models`.)*
- **Action registry** — a typed **code registry** (`BOOKING_ACTIONS`) of discriminated-union action
  descriptors in `finance-booking-util`, designed so it can later move to a Firestore collection
  without changing the dispatch logic.
- **Action abstraction** — actions are not hardwired to documents. A `BookingAction` discriminated
  union has a `type`; `generateDocument` is the first variant and references a `templateId`.
  Additional variants (e.g. `createTask`) slot in as new union members + new dispatch cases.
- **Counterparty can be a person or an org** — branching lives only in the payload builder; the PDF
  template is unchanged.

## Scope

**Build now**

- `BookingModel.counterparty: AvatarInfo | undefined` (schema change).
- Set the counterparty in the booking-edit modal via the existing avatar/subject picker; inherit
  from `invoice.receiver` when a booking is created from an invoice payment.
- `BookingAction` union + `BOOKING_ACTIONS` registry, with the single gss/`3407` →
  `gss-spendenbestaetigung` `generateDocument` entry.
- Payload builder for person **and** org counterparties.
- `BookingStore.availableActions(booking)` and `runAction(action, booking)`.
- Booking-list per-item ActionSheet showing available actions.
- Seed script that creates the `gss-spendenbestaetigung` template + published version in Firestore.

**Designed-for, not built**

- `createTask` action variant.
- Firestore-backed action registry (the code registry is shaped to migrate cleanly).

**Out of scope**

- Editing action bindings at runtime / admin CRUD UI for the registry.
- Multi-currency receipts (amount is the booking's functional-currency value).

## Architecture

### Data model

```ts
// shared-models/booking.model.ts
public counterparty: AvatarInfo | undefined;  // external party of the booking
```

`AvatarInfo` = `{ key, name1, name2, modelType, type, subType, label }` (existing).

### Action descriptors — finance-booking-util

```ts
type BookingTrigger = { accountingTenantId: string; accountId: string }; // accountId = AccountModel.id (number, e.g. '3407')

interface BaseBookingAction {
  id: string;          // stable id, e.g. 'gss-spende-receipt'
  labelKey: string;    // i18n key
  icon: string;        // svgIcon name
  trigger: BookingTrigger;
}
interface GenerateDocumentAction extends BaseBookingAction {
  type: 'generateDocument';
  templateId: string;
  outputFormat?: 'pdf' | 'docx';   // default 'pdf'
}
interface CreateTaskAction extends BaseBookingAction {   // future
  type: 'createTask';
  responsibleKey: string;
  taskTitleKey: string;
}
type BookingAction = GenerateDocumentAction | CreateTaskAction;

export const BOOKING_ACTIONS: BookingAction[] = [
  {
    id: 'gss-spende-receipt',
    type: 'generateDocument',
    trigger: { accountingTenantId: 'gss', accountId: '3407' },
    templateId: 'gss-spendenbestaetigung',
    labelKey: '@finance.booking.action.createReceipt',
    icon: 'document',
  },
];
```

### Matching & dispatch — BookingStore (finance-booking-feature)

- `availableActions(booking)`:
  1. Gather the booking's line account keys, resolve each to `AccountModel.id` via `AccountingStore`.
  2. Return every `BOOKING_ACTIONS` entry whose `trigger.accountingTenantId === booking.accountingTenantId`
     **and** whose `trigger.accountId` is among the booking's account ids.
- `runAction(action, booking)` switches on `action.type`:
  - `generateDocument`:
    1. Require `booking.counterparty`; if missing, surface a hint (action disabled / routes to edit).
    2. Resolve `counterparty.key` by `modelType`:
       - person → `PersonModel` (firstName, lastName, gender) + favourite `AddressModel`.
       - org → `OrgModel` (name) + favourite `AddressModel`.
    3. `buildReceiptPayload(...)` → `{ logoUrl, greeting, firstName, lastName, streetName, streetNumber, zipCode, city, date, amount }`.
    4. `DocGenerationService.generate({ templateId, payload, options: { margin: {top:'0',right:'0',bottom:'0',left:'0'} } })`.
    5. Open the returned signed URL.

### Payload builder — finance-booking-util (pure, unit-tested)

`buildReceiptPayload(counterparty, person | org, address, booking)`:

| field | person | org |
|-------|--------|-----|
| `greeting` | `gender === 'female' ? 'Liebe ' + firstName : 'Lieber ' + firstName` | `'Sehr geehrte Damen und Herren'` |
| `firstName` | person.firstName | `''` |
| `lastName` | person.lastName | org name |
| `streetName`/`streetNumber`/`zipCode`/`city` | from favourite address | from favourite address |
| `date` | `convertDateFormat(booking.date, StoreDate → ViewDate)` (DD.MM.YYYY) | same |
| `amount` | de-CH formatted from line amount on `3407` ÷ 100 | same |
| `logoUrl` | tenant logo url | same |

`amount` is pre-formatted to a string here (e.g. `1’000.00`), so the template needs no Handlebars
helper. `greeting` is pre-built here, so the template has no gender/`eq` logic.

### Booking list (finance-booking-feature)

Per-item ActionSheet listing `availableActions(booking)`; selecting one calls `runAction`. The
existing list is a stub — it gains the lines-per-booking load and the ActionSheet; full
`generating-lists` treatment (header counts, filters) is not required by this change but the
ActionSheet follows that skill's per-item action pattern.

### Template seed script

A one-shot script (run against Firestore/emulator) that:

- Creates a `TemplateModel` (`bkey: 'gss-spendenbestaetigung'`, name, category `other`,
  `defaultOutputFormat: 'pdf'`, `status: 'published'`, `currentVersion: 1`, tenant `gss`).
- Creates version `1` in the `versions` subcollection with `html` = the template file contents,
  `status: 'published'`. CSS stays inline in the html `<style>` (no separate `css` field needed).
- `sampleData` set to the documented example payload for preview.

The template (`gss-spendenbestaetigung.hbs`) uses **no custom Handlebars helpers** — every value is a
plain interpolation supplied pre-formatted by `buildReceiptPayload`.

## Error handling

| Condition | Behaviour |
|-----------|-----------|
| Booking has no `counterparty` | Action is shown disabled with a hint to set the counterparty (or routes into the edit modal). No call made. |
| Counterparty has no usable address | Error toast; no PDF generated. |
| Account `3407` line not found on booking | Action not offered (matching fails). |
| `generateDocument` call fails | Error toast; failure recorded by the callable's own audit (`DocGenerationModel`). |

## Testing

- **Unit (Vitest), `finance-booking-util`:**
  - `matchActions` — tenant hit/miss, account hit/miss, multi-line bookings.
  - `buildReceiptPayload` — person (female/male greeting) and org (neutral greeting, name mapping),
    amount formatting (Rappen → de-CH string), date formatting.
- **Manual:** run the seed script against the emulator, trigger the booking-list action for a gss
  booking on `3407` with a counterparty set, confirm the PDF renders with margin 0.

## Open questions

- ❓ **Receipt storage mode** — `persist` (audited, default) vs `ephemeral` (preview). Leaning
  `persist`. Confirm during planning.
- ❓ **Counterparty when missing at action time** — disable the action vs deep-link into the edit
  modal to set it. Leaning disable + hint. Confirm during planning.

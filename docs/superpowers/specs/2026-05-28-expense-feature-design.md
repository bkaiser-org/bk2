# Expense Feature Design

**Date:** 2026-05-28  
**Status:** Approved  
**Source spec:** `docs/2026-05-25-expense-feature-spezifikation.md`

---

## Scope

Implement the expense submission feature (Auslagen/Spesen) per spec v1.0, with the following scope decisions:

- **OCR deferred:** No OCR integration in this iteration. `ExpenseDocument` records are created with `ocrStatus = 'pending'` as placeholders for a future OCR Cloud Function.
- **Client-driven saga (Option A):** The Angular store drives all steps sequentially with compensating rollback. No Cloud Function for orchestration.
- **Existing `ExpenseModel` replaced:** The old Bexio-centric model is replaced with the spec-aligned model.
- **No new `ProfileAddress` model:** Bank account IBANs are stored as `AddressModel` records with `addressChannel = 'bankaccount'`, which already supports `iban` and `isFavorite`. No schema addition needed.

---

## Data Models

### Replace `ExpenseModel` (`libs/shared/models/src/lib/expense.model.ts`)

```ts
export type ExpenseStatus = 'draft' | 'processing' | 'validated' | 'error' | 'posted';

export class ExpenseModel implements BkModel, SearchableModel, TaggedModel {
  bkey = DEFAULT_KEY;
  tenants: string[] = DEFAULT_TENANTS;
  isArchived = false;
  index = DEFAULT_INDEX;
  tags = DEFAULT_TAGS;
  notes = DEFAULT_NOTES;

  abstract = '';               // Betreff, 3–200 chars
  amountTotal = 0;             // stored in cents (like BookingLineModel)
  currency = 'CHF';            // ISO 4217
  iban = '';                   // normalized: uppercase, no spaces
  category = '';               // optional; maps to expense account key
  costCenterId = '';           // optional
  note = '';                   // optional internal comment
  status: ExpenseStatus = 'draft';
  bookingKey = DEFAULT_KEY;    // set after booking creation
  userId = DEFAULT_KEY;        // submitter's user bkey
  accountingTenantId = '';
}

export const ExpenseCollection = 'expenses';
export const ExpenseModelName = 'expense';
```

### New `ExpenseDocumentModel` (`libs/shared/models/src/lib/expense-document.model.ts`)

One record per uploaded receipt attached to an expense.

```ts
export type OcrStatus = 'pending' | 'completed' | 'failed' | 'manual';

export class ExpenseDocumentModel implements BkModel {
  bkey = DEFAULT_KEY;
  tenants: string[] = DEFAULT_TENANTS;
  isArchived = false;

  expenseKey = DEFAULT_KEY;    // ref to ExpenseModel
  documentKey = DEFAULT_KEY;   // ref to DocumentModel

  // OCR fields — all optional, populated when OCR iteration is implemented:
  ocrInvoiceDate = '';         // StoreDate yyyymmdd
  ocrAmount = 0;               // in cents
  ocrSubject = '';
  ocrVatAmount = 0;
  ocrVatRate = 0;
  ocrCurrency = '';
  ocrConfidence = 0;
  ocrStatus: OcrStatus = 'pending';
}

export const ExpenseDocumentCollection = 'expense-documents';
export const ExpenseDocumentModelName = 'expenseDocument';
```

### `AddressModel` — no changes

Bank account IBANs are stored as `AddressModel` with `addressChannel = 'bankaccount'`, `iban` field, `isFavorite`, and `parentKey = user.bkey`. The existing model already supports this fully.

### `AccountingConfig` extension

Add two optional fields to `AccountingConfigModel` (or its defaults):
- `defaultExpenseAccountKey: string` — debit side for expense bookings
- `employeePayablesAccountKey: string` — credit side (Verbindlichkeiten gegenüber Mitarbeiter)

---

## Library Structure

New domain: `libs/finance/expense/` with four standard layers.

```
libs/finance/expense/
  data-access/
    src/lib/expense.service.ts          — CRUD on 'expenses' collection
    src/lib/expense-document.service.ts — CRUD on 'expense-documents' collection
    src/lib/scope.ts
    src/index.ts
  util/
    src/lib/expense.util.ts             — factory functions, amount normalization
    src/lib/expense.validations.ts      — vest suite
    src/lib/scope.ts
    src/index.ts
  ui/
    src/lib/expense.form.ts             — dumb form component
    src/lib/scope.ts
    src/index.ts
  feature/
    src/lib/expense-new.modal.ts        — submission form modal
    src/lib/expense-list.ts             — page: all expenses (treasurer view)
    src/lib/expense-detail.modal.ts     — read-only detail view
    src/lib/expense.store.ts            — submit saga + list state
    src/lib/scope.ts
    src/index.ts
```

Each layer requires `tsconfig.json`, updated `tsconfig.lib.json`, and `package.json` following existing sibling lib conventions.

---

## Component Design

### `ExpenseForm` (ui)

Dumb component. Inputs: current form value, list of saved bank account addresses, i18n object. Outputs: value changes.

Fields rendered:
- `abstract` — text input, required
- `amountTotal` — number input, required
- `currency` — select (CHF default + allowed ISO codes)
- `iban` — text input with dropdown of saved IBANs (favorite pre-selected, marked with ★); "+ Neue IBAN" option clears and opens free text entry; real-time IBAN checksum validation
- `category` — optional select
- `costCenterId` — optional select
- `belege` — file upload zone (drag-and-drop + "Datei wählen" + "Foto aufnehmen" on mobile); thumbnails with × remove button; accepted: PDF, JPG, PNG, HEIC; max 20 MB/file, max 10 files
- `note` — optional textarea

### `ExpenseNewModal` (feature)

Smart modal opened from FAB or nav menu. Provides `ExpenseStore`. Shows `ExpenseForm`. Below the submit button: a progress status line driven by `store.submitStep`:

| `submitStep` | Displayed text |
|---|---|
| `iban` | Bankverbindung wird gespeichert… |
| `upload` | Belege werden hochgeladen… |
| `saving` | Auslage wird gespeichert… |
| `booking` | Buchung wird erstellt… |
| `done` | ✓ Auslage eingereicht |
| `error` | Fehler — Vorgang wurde zurückgerollt |

On `done`: success toast with booking number, modal dismisses. On `error`: error toast, form re-enabled.

### `ExpenseList` (feature)

Page component. Lists expenses for the accounting tenant via `rxResource`. Each row shows: date, abstract, amount+currency, status badge, submitter name. Tap opens `ExpenseDetailModal`. FAB opens `ExpenseNewModal`.

Treasurer sees all expenses. Regular user sees only their own (filtered by `userId = currentUser.bkey`).

### `ExpenseDetailModal` (feature)

Read-only view. Shows all expense fields, booking reference (tappable link to booking), attached document thumbnails with download links. Status badge with color.

---

## Submit Saga (ExpenseStore)

`submitStep` signal drives progress UX. All steps run in sequence; on any error the completed steps are compensated in reverse order.

```
Step 1 — IBAN
  Load user's bank account addresses (addressChannel='bankaccount', parentKey=user.bkey)
  Normalize submitted IBAN (uppercase, strip whitespace)
  If not found: create AddressModel (isFavorite = true if first, false otherwise)
  → Track: newAddressKey (for rollback)

Step 2 — Upload documents
  For each file in form.belege:
    Upload to Firebase Storage via UploadService → get downloadURL
    Create DocumentModel record
  → Track: [documentKey[]] (for rollback)
  On failure: delete already-uploaded files + DocumentModel records; delete newAddressKey if set

Step 3 — Persist expense + document records
  Create ExpenseModel (status='draft')
  Create ExpenseDocumentModel per file (ocrStatus='pending')
  → Track: expenseKey (for rollback)
  On failure: delete documents/files; delete newAddressKey if set

Step 4 — Create booking
  Build BookingModel:
    title = `[abstract] – Auslage [user.displayName]`
    date = today (StoreDate)
    accountingTenantId from AccountingStore
  Build BookingLineModel[2]:
    Line 1: debit = expense account (category mapping or accountingConfig.defaultExpenseAccountKey)
    Line 2: credit = accountingConfig.employeePayablesAccountKey
    Both lines: amount = expenseModel.amountTotal
  Call BookingService.create(booking, lines, currentUser)
  Update ExpenseModel: bookingKey = booking.bkey, status = 'posted'
  On failure: cancel booking; update expenseModel.status = 'error'
```

Compensation is best-effort (network failures mid-flow may leave orphaned Storage files — acceptable for this iteration).

---

## Form Validation (vest)

Suite `expenseValidations` in `expense.validations.ts`:

| Field | Rules |
|---|---|
| `abstract` | required, minLength(3), maxLength(200) |
| `amountTotal` | required, > 0, ≤ 9_999_999_99 (cents) |
| `currency` | required, in ALLOWED_CURRENCIES whitelist |
| `iban` | required, valid IBAN checksum (reuse `ibanIsValid` from `@bk2/subject-address-util`) |
| `belege` | min 1 file |

---

## Routing

Two new routes added to the app routing (follow existing route file patterns):

```ts
{ path: 'expenses',     component: ExpenseList,       canActivate: [isAuthenticatedGuard] },
{ path: 'expenses/:id', component: ExpenseDetailPage, canActivate: [isAuthenticatedGuard] },
```

`ExpenseNewModal` has no route — opened as a modal from the FAB on `ExpenseList` and from the nav menu.

Treasurer list view and admin config are menu-controlled (menu items only visible to treasurer/admin roles via existing menu permission system — no additional route guard).

---

## I18n

All static strings through store i18n pattern. Keys under `@finance.expense.*`. German as default language (as per project config). Keys to add to translation files:

- `@finance.expense.list.title`
- `@finance.expense.new.title`
- `@finance.expense.detail.title`
- `@finance.expense.field.abstract`
- `@finance.expense.field.amount`
- `@finance.expense.field.currency`
- `@finance.expense.field.iban`
- `@finance.expense.field.category`
- `@finance.expense.field.costcenter`
- `@finance.expense.field.note`
- `@finance.expense.field.belege`
- `@finance.expense.submit.iban`
- `@finance.expense.submit.upload`
- `@finance.expense.submit.saving`
- `@finance.expense.submit.booking`
- `@finance.expense.submit.done`
- `@finance.expense.submit.error`
- `@finance.expense.status.draft`
- `@finance.expense.status.processing`
- `@finance.expense.status.validated`
- `@finance.expense.status.error`
- `@finance.expense.status.posted`

---

## Out of Scope (this iteration)

- OCR receipt extraction (Cloud Function + provider integration)
- Approval workflow (Vier-Augen-Prinzip)
- VAT line items from OCR
- Multi-currency expenses (form and booking currency differ)
- Automatic pain.001 payment generation
- Offline draft caching
- Duplicate receipt detection (SHA-256 hash check)
- Amount difference dialog (only needed once OCR lands)
- Admin config screen for expense account defaults

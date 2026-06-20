# Accounting System Design

**Date:** 2026-05-27
**Status:** Approved
**Spec source:** docs/2026-05-27-buchhaltungssystem-spezifikation.md v1.4

---

## Overview

A full double-entry accounting system for Swiss SMEs, built as a feature group in `libs/finance/` and integrated into `scs-app`. Covers eight phases delivered as vertical slices.

---

## Architecture Decisions

### Double-layered tenancy

All accounting data is isolated on two levels:

| Level | Field | Scope |
| :---- | :---- | :---- |
| bk-tenant | `tenants: string[]` | Firebase deployment (existing) |
| Accounting tenant | `accountingTenantId: string` | Organisation within a bk-tenant (`= org.bkey`) |

Every Firestore query on accounting data filters both levels. The active `accountingTenantId` is read from the URL param and held in `AccountingStore`.

### Always use BookingLines

Every booking — including simple 1:1 — uses `BookingLineModel` entries. `BookingModel` is a pure header with no amount fields. Invariant: Σ debitAmount = Σ creditAmount across all lines of a booking (in functional currency).

### Accounting backend: native vs. external cache

`AccountingConfigModel.accountingBackend: 'native' | 'bexio' | 'datev'` controls whether bk2 is the system of record or a read-only sync cache.

- `'native'`: full CRUD in bk2 accounting features
- `'bexio'`: Bexio is authoritative; bk2 collections are populated by sync Cloud Functions; UI is read-only
- `'datev'`: reserved for future integration

`AccountingStore` exposes `isExternallyManaged = computed(() => config()?.accountingBackend !== 'native')`. All feature stores gate write operations on this signal. A `ReadOnlyBanner` component is shown when true.

#### Bexio CF adaptations (Phase 2)

All four existing sync CFs (`syncBexioAccounts`, `syncBexioJournal`, `syncBexioInvoices`, `syncBexioBills`) need:

- Add `accountingTenantId: bexioTenantId.value()` to every document written
- `journal.ts`: write to `bookings` (not `journallogs`); write `BookingModel` header + two `BookingLineModel` docs per entry (debit + credit) in the same Firestore batch; add `status: 'posted'`, `bookingNo = Bexio id`
- `shared.ts`: replace `toStoreDate()` with `convertDateFormatToString` from `@bk2/shared-util-core` (CLAUDE.md convention)

#### Incremental sync semantics & status freshness (bills / invoices)

Both `syncBexioBills` and `syncBexioInvoices` run as a daily scheduled CF (06:00 Europe/Zurich) plus an on-demand `onCall` for manual backfill. Each persists with `batch.set(doc, { merge: true })` keyed by the Bexio id, so re-fetching an already-synced record **overwrites** its mutable fields — including the mapped `state` (`bill.status` → lowercase; invoice `kb_item_status_id` → `mapInvoiceStatus`). The merge write is therefore not the limiting factor for status freshness — **what gets re-fetched is.** The two integrations differ in how they bound the incremental fetch:

- **Invoices** filter server-side on Bexio's **modification** timestamp: `kb_invoice/search` with `[{ field: 'updated_at', value: lastSyncedAt, criteria: '>' }]`. Any invoice modified since the last run — including a pure status change on an old invoice — is re-fetched and its `state` refreshed. ✅ Status changes always propagate.

- **Bills** use the v4 `/purchase/bills` endpoint, which exposes no `updated_at` query filter. The freshness-correct predicate is a **client-side** filter on `b.updated_at > lastBillSyncedAt` (NOT `created_at` — `created_at` is immutable, so a status change on an existing bill would never re-emit; this was the original bug). To avoid paging the entire bill history on every run, a **server-side `bill_date_start` lookback window** bounds the fetch:
  - **Scheduled sync** → `bill_date_start = today − 12 months` (computed via `addDuration(getTodayStr(IsoDate), { months: -12 }, IsoDate)`; the codebase `subDuration` is buggy — it calls `add` not `sub` — so use `addDuration` with a negative duration). Trade-off: a bill with a `bill_date` older than 12 months whose status changes afterwards is **not** caught by the daily job.
  - **Manual `syncBexioBills`** → `bill_date_start` defaults to full history (`2000-01-01`); the call accepts optional `{ fromDate, billDateStart }` to narrow it. Use a manual full-history run to backfill or to repair stale statuses on bills outside the 12-month window.

  Net: server-side `bill_date_start` limits **paging**; client-side `updated_at` limits **writes** to only changed bills within the window. `bill_date_start` filters on the document date and is **not** a substitute for the `updated_at` freshness filter — the two serve different purposes and are combined.

### ResourceModel / AssetModel separation

`AssetModel` is the financial ledger entry. `ResourceModel` is the physical catalog. They are linked via optional `AssetModel.resourceKey`. `ResourceModel` has no knowledge of `AssetModel`. `ResourceModel.currentValue` (market estimate) is not auto-synced from book value.

### Payment delivery extensibility

`PaymentOrderModel.deliveryMethod: 'pain001_download' | 'bexio_api' | 'ebics'`. Phase 7 implements `pain001_download`. Future channels share the same approval flow — only the Cloud Function at the end differs. No model changes needed to add `bexio_api` or `ebics`.

### Payment approver as Responsibility

The four-eyes approver for payments is not a role. It is a `ResponsibilityModel` with `name = 'payment_approver'`, `parentKey = accountingTenantId`. The payment feature checks that the approving user is `responsibleAvatar` on this responsibility and is a different person from the creator.

### Routes

All accounting routes live under `/accounting/:accountingTenantId/`. Navigation items appear in the existing `scs-app` side menu. A parent `AccountingShell` component reads the route param, provides `AccountingStore`, and renders `<router-outlet>`.

### Roles

| Spec role | bk2 `Roles` field | Guard |
| :---- | :---- | :---- |
| Administrator | `admin` | `isAdminGuard` |
| Buchhalter / Erfasser | `treasurer` | `isPrivilegedGuard` |
| Freigeber | `ResponsibilityModel` (`payment_approver`) | inline check |
| Revisor | `auditor` *(new)* | `isAuditorGuard` |
| Leser | `registered` | `isAuthenticatedGuard` |

---

## New Shared Models

All created in `libs/shared/models/src/lib/` and exported from `index.ts`. All pass `npx tsc --noEmit`.

| Model | File | Collection | accountingTenantId |
| :---- | :---- | :---- | :---- |
| `AccountingConfigModel` | `accounting-config.model.ts` | `accounting-configs` | yes (= bkey) |
| `BookingModel` | `booking.model.ts` | `bookings` | yes |
| `BookingLineModel` | `booking-line.model.ts` | `booking-lines` | yes |
| `PeriodModel` | `period.model.ts` | `periods` | yes |
| `VatCodeModel` | `vat-code.model.ts` | `vat-codes` | yes |
| `ExchangeRateModel` | `exchange-rate.model.ts` | `exchange-rates` | no (shared) |
| `AssetCategoryModel` | `asset-category.model.ts` | `asset-categories` | yes |
| `AssetModel` | `asset.model.ts` | `assets` | yes |
| `AssetMovementModel` | `asset-movement.model.ts` | `asset-movements` | yes |
| `PaymentOrderModel` | `payment-order.model.ts` | `payment-orders` | yes |
| `PaymentModel` | `payment.model.ts` | `payments` | yes |

## Extended Existing Models

| Model | File | Fields added |
| :---- | :---- | :---- |
| `AccountModel` | `account.model.ts` | `accountingTenantId`, `vatCodeKey`, `currency` |
| `InvoiceModel` | `invoice.model.ts` | `accountingTenantId`, `invoiceNo`, `bookingKey` |
| `InvoicePositionModel` | `invoice-position.model.ts` | `accountKey`, `vatCodeKey` |
| `BillModel` | `bill.model.ts` | `accountingTenantId` |
| `Roles` | `roles.ts` | `auditor` |

`BookingJournalModel` and collection `journallogs` are left unchanged. The administrator migrates the Firestore collection manually.

---

## Phase Plan

### Phase 1 — Foundation

New libs: `libs/finance/accounting/data-access`, `libs/finance/accounting/feature`

- `AccountingConfigService` — CRUD for `accounting-configs`
- `AccountingStore` — holds `accountingTenantId`, `AccountingConfigModel`, available tenant list; exposes `isExternallyManaged` computed signal
- `AccountingShell` — parent route component, provides `AccountingStore`; shows `ReadOnlyBanner` when `isExternallyManaged`
- `TenantSelector` — dropdown navigating to `/accounting/:id/...`
- `ReadOnlyBanner` — info banner shown when `accountingBackend !== 'native'`
- `isAuditorGuard` in `@bk2/shared-feature`
- Route: `/accounting/:accountingTenantId` with child routes for all modules
- Nav items added to `scs-app` side menu

### Phase 2 — Core Bookkeeping

New libs: `libs/finance/booking/data-access`, `libs/finance/booking/feature`, `libs/finance/booking/ui`, `libs/finance/booking/util`; `libs/finance/period/data-access`, `libs/finance/period/feature`

- `BookingService` — CRUD + `bookingNo` generation (sequential per year + accountingTenantId)
- `BookingLineService` — CRUD for booking lines
- `PeriodService` — CRUD, lock/unlock
- `BookingStore` — booking list + edit
- `BookingEditModal` — form with dynamic line entry (debit/credit, account selector, VAT code)
- `PeriodList` — list with lock/unlock actions
- `booking.util.ts` — balance validation (Σ debit = Σ credit), booking number generation
- Journal feature updated: collection `bookings`, `accountingTenantId` filter, period selector, status filter
- Route: `/accounting/:id/journal`, `/accounting/:id/periods`

### Phase 3 — Swiss VAT

New libs: `libs/finance/vat-code/data-access`, `libs/finance/vat-code/feature`, `libs/finance/vat-code/ui`, `libs/finance/vat-code/util`

- `VatCodeService` — CRUD; seed standard CH codes on tenant creation
- `VatCodeStore`, `VatCodeList`, `VatCodeEditModal`, `VatCodeForm`
- `vatCode.util.ts` — compute VAT amount from net/gross, resolve active code by date
- Route: `/accounting/:id/vat-codes`

### Phase 4 — Multi-Currency

New libs: `libs/finance/exchange-rate/data-access`, `libs/finance/exchange-rate/util`

- `ExchangeRateService` — query by currency pair + date range, resolve rate for a date
- `exchangeRate.util.ts` — convert amount, pick closest rate for date
- Cloud Function `fetchSnbRates` — daily SNB API fetch + write `ExchangeRateModel`
- Cloud Function `setManualRate` — callable, writes `source: 'manual'` override
- FX fields wired into `BookingEditModal` (amountFx, exchangeRateKey)

### Phase 5 — Reporting

New libs: `libs/finance/reporting/data-access`, `libs/finance/reporting/util`; feature pages in existing domain libs

- `ReportingService` — `getAccountBalances()`, `getJournalEntries()` (client-side aggregation)
- `exportToCsv()` util
- `BalanceSheetPage` — `/accounting/:id/balance`
- `IncomeStatementPage` — `/accounting/:id/income-statement`
- `CashFlowPage` — `/accounting/:id/cash-flow`
- `AccountDetailPage` (extension of `finance/account`) — `/accounting/:id/accounts/:accountKey`

### Phase 6 — Asset Accounting

New lib: `libs/finance/asset/data-access`, `libs/finance/asset/feature`, `libs/finance/asset/ui`, `libs/finance/asset/util`

- `AssetService`, `AssetCategoryService`, `AssetMovementService`
- `AssetList`, `AssetEditModal`, `AssetDetailPage`, `AssetStore`
- `DepreciationRunPage` — preview + post depreciation for a period
- `asset.util.ts` — depreciation schedule, book value at date, pro-rata calculation
- Routes: `/accounting/:id/assets`, `/accounting/:id/assets/:assetKey`, `/accounting/:id/depreciation-run`
- Asset category configuration wired into accounting config page (Phase 1 config shell)

### Phase 7 — Payments (ISO 20022 pain.001)

New lib: `libs/finance/payment/data-access`, `libs/finance/payment/feature`, `libs/finance/payment/ui`, `libs/finance/payment/util`

- `PaymentOrderService`, `PaymentService`
- `PaymentOrderList`, `PaymentOrderEditModal`, `PaymentOrderDetailPage`, `PaymentStore`
- `iban.util.ts` — MOD-97 validation
- `pain001.util.ts` — auto-detect payment type from IBAN/currency/reference
- Cloud Function `generatePain001` — produces ISO 20022 pain.001.001.09 XML, validates against SIX XSD
- Four-eyes approval: checks `payment_approver` ResponsibilityModel, enforces different user from creator
- Routes: `/accounting/:id/payments`, `/accounting/:id/payments/:orderKey`

### Phase 8 — Accounts Receivable Extensions

Extensions to existing `libs/finance/invoice/` and `libs/finance/bill/`

- `invoiceNo` generation (sequential per year + accountingTenantId)
- Position-level `accountKey` + `vatCodeKey` selectors in `InvoiceEditModal`
- Payment reconciliation: marks invoice paid, creates `BookingModel` + 2 `BookingLineModel` entries
- `InvoiceAgingComponent` — aging report (0–30 / 31–60 / 61–90 / >90 days)
- `BillQrScanModal` — QR-invoice scanner, calls `parseQrInvoice` Cloud Function
- Cloud Functions: `generateInvoicePdf`, `parseQrInvoice`, `generateDunningPdf`

---

## Cloud Functions Summary

| Function | Module | Trigger |
| :---- | :---- | :---- |
| `fetchSnbRates` | Phase 4 | Daily Cloud Scheduler |
| `setManualRate` | Phase 4 | Callable (user) |
| `generatePain001` | Phase 7 | Callable (on payment approval) |
| `generateInvoicePdf` | Phase 8 | Callable (on demand) |
| `parseQrInvoice` | Phase 8 | Callable (on QR scan) |
| `generateDunningPdf` | Phase 8 | Callable (on demand) |

---

## Out of Scope (Folgeprojekte)

- Lohnbuchhaltung / Sozialabgaben
- Kostenrechnung (Kostenstellen, Kostenträger)
- EBICS direct connection
- eBill / Peppol BIS Billing 3.0
- Spesenabrechnung
- Konsolidierte Bilanz über mehrere Buchhaltungs-Mandanten

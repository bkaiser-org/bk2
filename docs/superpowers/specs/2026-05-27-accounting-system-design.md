# Accounting System Design

**Date:** 2026-05-27
**Status:** Approved
**Spec source:** docs/03_buchhaltungssystem-spezifikation.md v1.4

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
- `AccountingStore` — holds `accountingTenantId`, `AccountingConfigModel`, available tenant list
- `AccountingShell` — parent route component, provides `AccountingStore`
- `TenantSelector` — dropdown navigating to `/accounting/:id/...`
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

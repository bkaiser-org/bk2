# QR Payment Reference & Bank Reconciliation

**Date:** 2026-06-17
**Status:** decisions locked — D1 QRR (SCOR later), D2 approved, D3 QR-IBAN to be procured, D4 phased
**Bank:** Zürcher Kantonalbank (ZKB)

## 1. Why

Today the app prints a Swiss QR-bill payment slip **without a structured reference** (reference
type `NON`). The bank can confirm *that* money arrived but not *which invoice* it pays, so
reconciliation (marking an `InvoiceModel` paid, creating the `BookingModel`) is fully manual.

Goal: stamp every QR slip with a unique payment reference, then match incoming bank credits back
to invoices automatically — starting with a zero-cost, no-API path and leaving a clean upgrade
route to a real banking integration.

The reference (Part A) and the matcher (Part B) are **one project**: the reference is the single
thing that makes any form of automatic reconciliation possible, and the matcher is reused unchanged
no matter how the bank statement reaches us (Part C).

## 2. Current state (code references)

- [qr-slip.util.ts](../libs/shared/util-functions/src/lib/qr-slip.util.ts) — `QrSlipData` has
  `creditor`/`currency`/`amount`/`debtor`, **no `reference` field**; `buildQrSlipData` never sets one.
- [qr-slip.ts](../apps/functions/src/pdf/qr-slip.ts) — `resolvePayee` reads the owner org's
  favorite `bankaccount` address `iban`; `renderQrSlipSvg` hands data straight to `swissqrbill`.
- [generate-document.ts:166-180](../apps/functions/src/pdf/generate-document.ts#L166-L180) —
  assembles payee + payload → `buildQrSlipData` → appends the slip page.
- [invoice.model.ts](../libs/shared/models/src/lib/invoice.model.ts) — has `invoiceNo` (sequential
  per fiscal year + `accountingTenantId`), `accountingTenantId`, `paymentDate`, `state`,
  `bookingKey` (set when paid). No `paymentReference` field yet.
- Existing siblings to mirror: [parse-qr-invoice.ts](../apps/functions/src/payment/parse-qr-invoice.ts)
  (string parsing in a callable), [generate-pain001.ts](../apps/functions/src/payment/generate-pain001.ts)
  (ISO-20022 XML building in a callable).

`swissqrbill`'s `Data` type already supports a `reference` field — **no new dependency** for Part A.

## 3. Part A — Reference on the QR slip

### 3.1 Reference type — ✅ D1 resolved: QRR now, SCOR later

| | **QRR** (QR Reference) — chosen | **SCOR** (ISO 11649) — future |
|---|---|---|
| Account | Requires a **QR-IBAN** (digits 5–6 = `30`/`31`) | Works with the normal IBAN |
| Format | 27 digits, recursive **mod-10** check digit (= legacy ESR) | `RF` + 2 mod-97 digits + ≤21 alphanumerics |
| External dependency | Must request a QR-IBAN from ZKB (free) — see D3 | None |
| Reconciliation | Bank-native, what ZKB camt/test-platform expect | Equally matchable; international |

**QRR + ZKB QR-IBAN** is the target: Swiss-native, ESR-compatible, aligns with ZKB's camt files and
test platform. SCOR is a later addition (e.g. for international payers) and the generator is designed
so a `scor` reference type can be added without reworking the call sites.

### 3.2 Reference is optional per invoice — dual-IBAN logic (unblocks before the QR-IBAN arrives)

The QR-bill standard couples the reference type to the account: a **QRR** reference **must** be paired
with a **QR-IBAN**, and a **`NON`** (no-reference) slip **must** use a **regular IBAN**. You cannot put
a QRR on a normal IBAN. This makes "with or without reference" a natural per-invoice switch driven by
which account is available:

- **Until a QR-IBAN exists** — invoices carry **no** `paymentReference`; the slip renders as today
  (`NON`, regular IBAN). Nothing blocks invoicing.
- **Once the QR-IBAN is configured** on the payee — new invoices get a generated `paymentReference`;
  the slip renders as **QRR** using the **QR-IBAN**.
- **Both must remain possible for the same payee at the same time** — e.g. a back-dated or special
  invoice without a reference, alongside referenced ones.

The QR-IBAN is **self-identifying** — no separate "is QR account" flag is needed. A Swiss/Liechtenstein
IBAN is `CH`/`LI` + 2 check digits + a 5-digit **IID** (institution id) + 12-digit account; a QR-IBAN's
IID is in the reserved range **30000–31999** (the "digits 5–6 = `30`/`31`" rule). So a pure helper:

```text
isQrIban(iban):
  normalize: strip spaces, uppercase
  country is CH/LI  AND  30000 ≤ IID(chars 4..8) ≤ 31999
```

Therefore the reference requirement is **derived from the account IBAN**, not stored as a flag:

```text
selected account is a QR-IBAN  → reference type QRR, generate paymentReference
selected account is regular    → reference type NON, no reference
```

Both IBANs live on the payee org's `bankaccount` address(es) — both as ordinary `iban` values;
`isQrIban` classifies them, so **no `qrIban` field is needed**. The invoice picks which `bankaccount`
account to bill on; the generator derives the rest. If an invoice carries a `paymentReference` but the
selected account is **not** a QR-IBAN (or vice-versa), that is a configuration error and must fail
loudly rather than silently emit an invalid slip.

### 3.3 Schema change — ✅ D2 approved

Add to `InvoiceModel`:

- `paymentReference: string` (default `''`) — the QRR string when a reference applies, empty for a
  `NON` invoice. Generated **once at invoice creation** so the printed slip and the later bank match
  use the identical value. Empty string = no reference / regular-IBAN slip.

Payee address: **no new field.** The QR-IBAN is stored as an ordinary `iban` on a second `bankaccount`
address; `isQrIban` (§3.2) classifies it. The only approved schema change is
`InvoiceModel.paymentReference`.

### 3.4 Work items

1. **Obtain a QR-IBAN from ZKB** (D3) and store it on the owner org's `bankaccount` address.
2. **`isQrIban(iban)` helper** — pure, unit-tested util in `shared-util-functions` (§3.2); classifies
   the account so the reference requirement is derived, not flagged.
3. **Reference generator** — pure, fully unit-tested util in `shared-util-functions`, with a `type`
   parameter (`'qrr'` now, `'scor'` later):
   - QRR: 26-digit base from `accountingTenantId` + fiscal year + zero-padded `invoiceNo`, plus the
     recursive mod-10 check digit. (SCOR later: `RF` + mod-97 over the base.)
4. **Persist** `paymentReference` on the invoice at creation — generated iff the selected `bankaccount`
   is a QR-IBAN; empty otherwise (`NON`).
5. **`resolvePayee`** surfaces the selected `bankaccount` IBAN(s) so the generator can classify them.
6. **Thread it through**: add `reference?: string` to `QrSlipData`; in `buildQrSlipData`, set/omit
   `reference` based on `isQrIban(account)`; pass it from `generate-document.ts`. Fail loudly on a
   mismatch (reference present on a non-QR account, or vice-versa).

## 4. Part B — Reconciliation via camt (no API, ship first)

Swiss standard: **camt.054 / camt.053** ISO-20022 XML; ZKB fully supports both. Flow needs no API,
no stored bank credentials:

1. Customer pays the slip → ZKB books the credit with our QRR/SCOR reference attached.
2. We download a camt file from ZKB e-banking (`camt.054` credit notifications, or end-of-day
   `camt.053`; a `camt.053` *with QR detail* contains everything, *without detail* the QR entries
   come as a separate `camt.054`).
3. A new callable `reconcileCamt` (mirroring `parse-qr-invoice`/`generate-pain001`) parses the XML,
   extracts each entry's amount + reference (`<Ntry>` → `<RmtInf><Strd><CdtrRefInf><Ref>`), looks up
   the invoice by `paymentReference`, and on a match sets `paymentDate`, `state='paid'`, links/creates
   the `BookingModel` (`bookingKey`).
4. UI reports matched vs. unmatched entries; unmatched handled manually.

Validate the whole loop for free on **ZKB's ISO-20022 test platform** (submit a pain.001, inspect the
resulting camt.053/054).

**The matcher built here is the reusable core** — Parts C only swap the *source* of the camt data.

## 5. Part C — Banking integration options (automation upgrade path)

The matcher from Part B is reused unchanged; only the input source changes.

| Option | Account data | Payments | Effort | Ongoing cost | Notes |
|---|---|---|---|---|---|
| **camt manual download** (Part B) | manual upload | manual | Lowest | Free | Build this first |
| **EBICS** | auto fetch | yes | High | Bank contract | DIY EBICS client + keys per bank |
| **SIX bLink** | REST (AIS) | privileged consent | Med–high | Monthly SIX fees | Onboarded partner; ZKB live on bLink |
| **DeepPay** (DeepCloud) | **REST** | **REST** | Medium | Subscription (no public price) | One REST API → 120+ Swiss banks incl. ZKB; auto-converts pain/camt formats; "available for any business platform", Swiss-hosted, ISO 27001, nFADP/GDPR |

Reality check: ZKB has **no free public developer REST API** for SME account/transaction data.
Programmatic access is EBICS (file exchange) or SIX bLink (paid). DeepPay is effectively
"EBICS/bLink-as-a-managed-service": one REST integration, ZKB included, payments + statements, format
conversion handled for us — but pricing and API docs are gated behind a sales/onboarding request.

## 6. Phasing — ✅ D4 resolved (phased)

The matcher (Part B) is built once and reused; each phase only changes how the camt data arrives.

### Phase 0 — Foundation (no QR-IBAN needed, ships immediately)

- Add `InvoiceModel.paymentReference`, the reference generator (QRR), and the dual-IBAN slip logic
  (§3.2–§3.4). With no QR-IBAN configured yet, all slips render as today (`NON`, regular IBAN) — this
  is a safe no-op for existing behavior and is the unblocking step.

### Phase 1 — QRR live (after the QR-IBAN arrives — D3)

- Configure the ZKB QR-IBAN on the payee. New invoices generate a `paymentReference` and slips render
  as QRR. Validate end-to-end on **ZKB's ISO-20022 test platform** before going live.

### Phase 2 — Manual camt reconciliation (Part B)

- `reconcileCamt` callable: upload ZKB `camt.054`/`camt.053` → match on `paymentReference` → mark
  invoices paid, link `BookingModel`. Free, no API, no stored bank credentials. **Ship this as the
  default reconciliation path.**

### Phase 3 — Automated statement fetch (optional upgrade)

- In parallel with Phase 2, request **DeepPay** API/pricing. If justified, swap the manual camt upload
  for a scheduled DeepPay fetch (one REST API → 120+ banks incl. ZKB, format conversion included) —
  **reusing the Phase 2 matcher unchanged**. EBICS is the DIY alternative; bLink only if a live API is
  specifically wanted and the recurring SIX fee is justified for a single-bank, low-volume use case.

## 7. Decisions (resolved) & follow-ups

- ✅ **D1 — Reference type:** QRR now; SCOR added later without reworking call sites (§3.1).
- ✅ **D2 — Schema change:** `paymentReference: string` on `InvoiceModel` approved (§3.3).
- 🟡 **D3 — QR-IBAN procurement:** owner to request a QR-IBAN from ZKB. **Document the QR-IBAN and the
  request/activation date here when obtained.** Not a blocker — Phase 0 ships without it.
- ✅ **D4 — Banking integration:** phased (§6). Start manual-camt; evaluate DeepPay for Phase 3.

### Open follow-ups

- ✅ Payee account modelling resolved: the QR-IBAN is an ordinary `iban` on a second `bankaccount`
  address, classified by `isQrIban` (§3.2) — no `qrIban` field. `InvoiceModel.paymentReference` remains
  the only approved schema change.
- ❓ Invoice → account selection UX: how the user picks which `bankaccount` (regular vs QR) an invoice
  bills on when the payee has both (default to QR-IBAN when present?). Decide at design time.

## 7. Non-goals

- 🔴 Real-time payment status / instant reconciliation.
- 🔴 Outbound payment automation beyond the existing `generatePain001`.
- 🔴 bLink onboarding (deferred unless explicitly chosen).

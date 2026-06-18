# Idea: Stripe Integration

**Date:** 2026-06-17
**Status:** Idea — stub, to be elaborated
**Origin:** New. Complements [QR Payment Reference & Reconciliation](../specs/2026-06-17-qr-payment-reference-reconciliation-spec.md) as an alternative/online payment rail.

## Problem / goal

Accept **card / online payments** (e.g. for invoices, applications, event fees) via Stripe, with
automatic reconciliation back to the originating invoice/application.

## Initial scope (to refine)

- Stripe Checkout / Payment Link per invoice or application.
- Webhook Cloud Function → mark invoice paid (mirror the camt reconciliation matcher).
- Secrets via Firebase secret manager; never client-side.

## Open questions

- Fees handling (who bears the Stripe fee); refunds.
- SCA/3DS, currencies, payout reconciliation into the accounting.
- Relationship to membership dues vs. one-off payments.

## Dependencies

- `finance/invoice`; reconciliation matcher (shared with QR camt). Cloud Function + webhook.

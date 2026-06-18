# Idea: Liquidity Planner

**Date:** 2026-06-17
**Status:** Idea — stub, to be elaborated
**Origin:** New.

## Problem / goal

Forecast **cash position over time** from known and expected in/outflows (open invoices, recurring
dues, payroll, planned expenses, loan repayments), so the org can anticipate shortfalls.

## Initial scope (to refine)

- Timeline of expected inflows (open AR / dues) and outflows (AP, payroll, amortisation).
- Scenarios (best/expected/worst); opening balance from accounting.
- Chart + table view; alerts when projected balance crosses a threshold.

## Open questions

- Granularity (weekly/monthly); confidence weighting of expected items.
- Manual planned items vs. derived-only.

## Dependencies

- Core bookkeeping; `finance/invoice` (AR); **[Debt/Amortisation Planner](2026-06-17-debt-amortisation-planner-spec.md)** (loan outflows); QR/Stripe reconciliation for actuals.

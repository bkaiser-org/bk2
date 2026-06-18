# Idea: Debt / Amortisation Planner

**Date:** 2026-06-17
**Status:** Idea — stub, to be elaborated
**Origin:** New.

## Problem / goal

Model loans/debts and their **amortisation schedules** (principal + interest over time), feeding the
liquidity forecast and giving an at-a-glance view of outstanding obligations.

## Initial scope (to refine)

- `DebtModel` (principal, rate, term, start, schedule type: annuity / linear / bullet).
- Generated amortisation schedule (per period: interest, principal, remaining balance).
- Link repayments to bookings; track actual vs. planned.

## Open questions

- Fixed vs. variable rate; early repayment / refinancing.
- Where schedules are stored (computed vs. persisted).

## Dependencies

- Core bookkeeping (postings of interest/principal). Feeds **[Liquidity Planner](2026-06-17-liquidity-planner-spec.md)**.

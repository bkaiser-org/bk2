# Idea: Kostenrechnung (Cost-Centre / Cost-Object Accounting)

**Date:** 2026-06-17
**Status:** Idea — stub, to be elaborated
**Origin:** Deferred Folgeprojekt from [Buchhaltungssystem spec](../done/2026-05-27-buchhaltungssystem-spezifikation.md) (§3; cost-centre report filter also deferred).

## Problem / goal

Track costs and revenues per **Kostenstelle** (cost centre) and **Kostenträger** (cost object) on
top of the financial accounting, so reports can be filtered/grouped by cost dimension.

## Initial scope (to refine)

- Cost-centre / cost-object dimensions on bookings (`BookingModel`).
- Report filter + grouping by cost dimension.
- Master data for cost centres/objects per accounting mandate.

## Open questions

- One or two dimensions (centre + object), or a single tag taxonomy?
- Allocation rules (Umlage) in scope, or direct postings only for v1?

## Dependencies

- **Core bookkeeping** ([Buchhaltungssystem](../done/2026-05-27-buchhaltungssystem-spezifikation.md)) must be in place.

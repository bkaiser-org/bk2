# Idea: Sozialabgaben Configuration

**Date:** 2026-06-17
**Status:** Idea — stub, to be elaborated
**Origin:** Deferred from [Buchhaltungssystem spec](../done/2026-05-27-buchhaltungssystem-spezifikation.md) (§3.8.7) — depends on payroll being in scope.

## Problem / goal

Maintain the social-insurance contribution rates (AHV/IV/EO, ALV, BVG, UVG, etc.) with
**historisation**, so payroll runs pick the rates valid for the relevant period.

## Initial scope (to refine)

- Contribution-rate config entity with validity ranges (effective-dated).
- Admin/backoffice UI card (`aoc-salary`).
- Consumed by payroll calculation per period.

## Open questions

- Per-tenant vs. central (federal/cantonal) default rates with tenant overrides?
- Which rates are user-editable vs. sourced from official tables?

## Dependencies

- **[Lohnbuchhaltung](../specs/2026-05-28-spec-lohnbuchhaltung.md)** (payroll) — primary consumer; must be taken into scope first.
- Core bookkeeping (for posting the contributions).

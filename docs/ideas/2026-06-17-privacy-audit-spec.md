# Idea: Privacy Audit

**Date:** 2026-06-17
**Status:** Idea — stub, to be elaborated
**Origin:** New. Builds on the deferred server-side enforcement noted in [Person Privacy design](../specs/2026-06-14-person-privacy-on-personmodel-design.md) (§out of scope).

## Problem / goal

A systematic review (and remediation plan) of how personal data is read, exposed, and protected
across the app — closing the gap between client-side `usage*` flags and **real server-side enforcement**.

## Initial scope (to refine)

- Inventory every person/address read path and what each role can see.
- Server-side sanitised projections (`getPersonView` Cloud Function) reading with admin rights.
- Lock down `persons` / `addresses` Firestore reads to privileged/own-record.
- Cover fields without `usage*` flags today (e.g. `iban`).
- DSG/GDPR checklist: consent, retention, export/erasure, data-processing records.

## Open questions

- Phasing vs. the existing client-side gating; migration risk on every read path.

## Dependencies

- Person/address model + rules; ties into Security Review follow-ups.

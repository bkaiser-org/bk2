# Idea: UI Audit

**Date:** 2026-06-17
**Status:** Idea — stub, to be elaborated
**Origin:** New.

## Problem / goal

A cross-cutting review of the UI for **consistency, accessibility, responsiveness and dark/light
theming**, producing a prioritised list of fixes and shared-component opportunities.

## Initial scope (to refine)

- Inventory list/edit/modal patterns; flag deviations from the form/list skill conventions.
- Accessibility pass (labels, focus order, contrast, screen-reader).
- Responsive + dark-mode coverage across sections and features.
- Icon usage consistency (svgIcon), empty/loading/error states.

## Open questions

- Audit-only vs. audit + remediation backlog; tooling (axe, Lighthouse)?

## Dependencies

- Cross-cutting; touches `shared/ui` and most features.

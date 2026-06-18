# Idea: Chart Bar Rendering for Member Sections

**Date:** 2026-06-17
**Status:** Idea — stub, to be elaborated
**Origin:** Deferred from [CMS Improvements spec](../done/2026-05-26-cms-improvements-spec.md) (§16) and [Member-Age Section design](../specs/2026-05-21-member-age-section-design.md).

## Problem / goal

`member-age` / `member-cat` sections store a `chartType` (incl. `'bar'`) but still render a **table**.
Add a bar-chart view so the configured `chartType` is honoured.

## Initial scope (to refine)

- Render a bar chart (echarts, like `chart-section`) when `chartType='bar'`.
- Keep table as the default / fallback.
- Respect existing `sortOrder` / `categoryFilter` config.

## Open questions

- Reuse the `chart-section` echarts wrapper directly, or a thin shared chart component?
- Stacked vs. grouped bars for the category breakdown?

## Dependencies

- CMS section renderers + echarts (already used by `chart-section`).

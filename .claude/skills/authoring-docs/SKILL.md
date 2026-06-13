---
name: authoring-docs
description: Use when creating or saving a spec, design, or implementation plan document, or when asked where a doc goes / how to name it / how to register it. Covers the yyyy-mm-dd-topic-[spec|design|plan] filename convention and keeping PENDING_IMPLEMENTATION.md (the TOC) in sync.
---

# Authoring Specs, Designs & Plans

## Core rule

Every spec, design, and plan document is named:

```
yyyy-mm-dd-topic-[spec|design|plan].md
```

- `yyyy-mm-dd` — the **creation date** (today's date when you first write it). Never renumber or re-date later.
- `topic` — short kebab-case subject (`vcard-export`, `location-select-map`).
- suffix — exactly one of `-spec`, `-design`, or `-plan`.

No leading numbers (`01_`, `17_`). No `Component`/CamelCase. Lowercase, hyphen-separated.

## What each type is, and where it lives

| Type | Purpose | Location |
|------|---------|----------|
| `-spec` | The *what & why* — requirements, scope, open questions | `docs/` while active → move to `docs/done/` once implemented |
| `-design` | The *how* — technical/architecture design | `docs/superpowers/specs/` |
| `-plan` | Step-by-step implementation plan | `docs/superpowers/plans/` |

When a spec is fully implemented, `git mv` it from `docs/` to `docs/done/` (keep the filename).

## PENDING_IMPLEMENTATION.md is the TOC

`docs/PENDING_IMPLEMENTATION.md` is the single table of contents tracking the **current implementation state** of each spec. Whenever you create, advance, or complete a spec, update its entry there.

Each entry: a numbered `##` heading with the title and a markdown link to the source spec, followed by status-marked bullet items.

```markdown
## 18. vCard Export — [`2026-06-12-spec-vcard-export.md`](done/2026-06-12-spec-vcard-export.md)

- 🟢 **Avatar source** — resolved in code.
- 🟡 **Tier 3 multi-select** — callable enforces cap; no UI wired yet.
- 🔴 **vCard 4.0 profile** — explicit non-goal.
```

Status legend (keep consistent with the file's own legend block):

| Marker | Meaning |
|--------|---------|
| 🔴 | not started / explicitly out of scope |
| 🟡 | partially done, work remaining |
| 🟢 | done / resolved |
| 🚀 | fixed in code, awaiting deploy / app build |
| ❓ | open question / decision needed |

## Workflow when creating a new doc

1. Pick type (`spec` / `design` / `plan`) and place it in the matching directory above.
2. Name it `yyyy-mm-dd-topic-<type>.md` using **today's** date.
3. Put a `**Date:** yyyy-mm-dd` line near the top so the date survives outside the filename.
4. For a **spec**: add an entry to `docs/PENDING_IMPLEMENTATION.md` with status bullets and a link to the new file.
5. If the doc references another spec/design/plan, link by its full current filename.

## Common mistakes

- Using a leading number (`19_...`) instead of a date — the old scheme; don't reintroduce it.
- Forgetting the type suffix, or using two (`-spec-plan`).
- Creating a spec but not registering it in `PENDING_IMPLEMENTATION.md`.
- Renaming/re-dating an existing doc on later edits — the date is the *creation* date and stays fixed.
- Putting a design or plan in `docs/` instead of `docs/superpowers/{specs,plans}/`.

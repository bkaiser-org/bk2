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

`docs/` is organised by **document type**, not by status. **There is no `docs/superpowers/` tree** —
these are the project locations, and they override the superpowers skills' defaults (see below).

| Type | Purpose | Location |
|------|---------|----------|
| idea / stub | seed spec, not yet elaborated | `docs/ideas/` |
| `-spec` | The *what & why* — requirements, scope, open questions | `docs/specs/` |
| `-design` | The *how* — technical/architecture design | `docs/specs/` |
| `-plan` | Step-by-step implementation plan | `docs/plans/` |
| reference | guides, inventories, non-spec docs | `docs/documentation/` |

**Specs and designs stay in `docs/specs/` for their whole life — do not move them on completion.**
Implementation status is tracked in `PENDING_IMPLEMENTATION.md` via each entry's `State:` field, not by
the folder. An idea that gets elaborated graduates from `docs/ideas/` to `docs/specs/`. `docs/done/` is
**retired** — use it only to archive a superseded or abandoned doc, never for "implemented".

## Superpowers writes here too

The superpowers `brainstorming` and `writing-plans` skills default to `docs/superpowers/specs/` and
`docs/superpowers/plans/`, **but both explicitly defer to user-configured locations**. This project's
locations override them: brainstorming designs → `docs/specs/`, plans → `docs/plans/`. (Do not edit the
plugin skill files — they live in the read-only plugin cache and are overwritten on update.)

## PENDING_IMPLEMENTATION.md is the TOC

`docs/PENDING_IMPLEMENTATION.md` is the single table of contents tracking the **current implementation
state** of every specified-but-not-fully-implemented topic. Whenever you create, advance, or complete a
spec, update its entry there.

**Use the [`pending-implementation`](../pending-implementation/SKILL.md) skill** for its structure
(four State-driven chapters: awaiting implementation, ideas, partially implemented, fully implemented),
the per-entry format (name, backlink, `State:`, postponed/excluded topics only), and how to (re)compile it.

## Workflow when creating a new doc

1. Pick type (`spec` / `design` / `plan`) and place it in the matching directory above.
2. Name it `yyyy-mm-dd-topic-<type>.md` using **today's** date.
3. Put a `**Date:** yyyy-mm-dd` line near the top so the date survives outside the filename.
4. For a **spec**: add an entry to `docs/PENDING_IMPLEMENTATION.md` (see the `pending-implementation` skill).
5. If the doc references another spec/design/plan, link by its full current filename.

## Common mistakes

- Using a leading number (`19_...`) instead of a date — the old scheme; don't reintroduce it.
- Forgetting the type suffix, or using two (`-spec-plan`).
- Creating a spec but not registering it in `PENDING_IMPLEMENTATION.md`.
- Renaming/re-dating an existing doc on later edits — the date is the *creation* date and stays fixed.
- Putting a design in `docs/` root or a plan outside `docs/plans/` — use `docs/specs/` and `docs/plans/`.
- Re-creating a `docs/superpowers/` tree — it no longer exists; specs/designs live in `docs/specs/`.

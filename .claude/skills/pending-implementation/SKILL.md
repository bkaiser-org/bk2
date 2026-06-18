---
name: pending-implementation
description: Use when creating, updating, or regenerating docs/PENDING_IMPLEMENTATION.md — the living table of contents of every specified-but-not-fully-implemented topic. Covers its three-chapter structure, the per-spec entry format (name, backlink, state, postponed/excluded topics only), and which docs to include vs skip.
---

# Maintaining PENDING_IMPLEMENTATION.md

`docs/PENDING_IMPLEMENTATION.md` is a **constantly-updated table of contents** of everything that has
been *specified but is not yet fully implemented*. Its job is discoverability: what is still open, and
where the source spec lives. It is **not** a changelog — never describe what was built, only what was
**postponed or excluded**.

## When to update it

- After creating a new spec/design (add an entry).
- After a spec advances or completes (update its **State** and prune resolved open topics).
- When asked to "regenerate" / "refresh" the TOC (rebuild from the doc tree — see workflow).

## Structure (four chapters, State-driven)

All spec & design docs live permanently in `docs/specs/` (ideas in `docs/ideas/`); files are **never
moved on completion**. So PENDING is grouped by **State**, not by folder:

1. **`## 1. Specs awaiting implementation`** — fully-written specs with no (or only foundational)
   implementation. Entry per spec with **State** + open topics.
2. **`## 2. Ideas / backlog (docs/ideas/)`** — seed/stub specs, each a one-liner with a backlink and
   the spec it was deferred from. End the chapter with a **dependency graph** (mermaid).
3. **`## 3. Partially implemented`** — some scope shipped, concrete work remaining.
4. **`## 4. Fully implemented`** — in-scope work done; only non-goals / future work remain.

List every doc in `docs/specs/` (both `-spec` and `-design`) under the chapter matching its State.
**Skip `docs/documentation/`** — reference docs, not specs. Pair a spec with its companion
implementation/review doc (e.g. cookie-consent spec + implementation) in one entry where it reads better.

## Per-entry format (chapters 2 & 3)

```markdown
### <n>. <Name> — [`<file>.md`](<relative-path>)
**State:** Fully implemented.
- 🔴 <topic that was excluded / is a non-goal> (§ref).
- 🟡 <topic partially done, work remaining> (§ref).
```

- **Name** — the feature/topic title.
- **Backlink** — markdown link to the source doc (relative to `docs/`).
- **State** — exactly one of: `Open` · `Partially implemented` · `Fully implemented`.
- **Open topics** — a *short* bullet list of only the postponed/excluded items. Reference the
  source chapter/section (`§3`, `§9`, `§1.2`) and keep each to one line. If a design mirrors a
  spec, cross-reference that entry instead of repeating its topics. If nothing is deferred, say so
  in one line ("no deferred topics noted") rather than inventing bullets.

Status markers for the bullets: 🔴 not started / explicitly out of scope · 🟡 partially done ·
🚀 fixed in code, awaiting deploy/app build · ❓ open question / decision needed.

## Determining State

- **Open** — no implementing lib/feature exists yet (verify, e.g. `ls libs/...`).
- **Partially implemented** — some phases shipped, others deferred; or shipped-but-awaiting-deploy.
- **Fully implemented** — in-scope work done; only explicit non-goals / future work remain.

Find the deferred topics fast by grepping each doc's scope sections rather than reading it whole:

```sh
grep -niE '^#{1,4} .*(out.of.scope|open.quest|offen|deferred|follow.?up|future|nicht|abgrenzung|not implemented|limitation|excluded)' <file>
```

Then print the section body (heading line → next heading) to extract the bullets.

## Workflow to (re)compile

1. List the sources: `docs/ideas/*.md` and `docs/specs/*.md` (ignore `docs/documentation/`).
2. For each spec/design, grep the scope/open-question sections and pull the postponed/excluded items.
3. Decide **State** (verify with the codebase when unsure whether something shipped) and file it under
   the matching chapter.
4. Write the four chapters; cross-reference ideas ↔ the spec they were deferred from. Keep the header's
   **Last compiled** date and the status legend current.

## Common mistakes

- Describing what was implemented (this file lists only what is *not* done).
- Including normal documentation in chapter 1 instead of only real specs.
- Long open-topic bullets — keep them terse and reference the section number.
- Forgetting to flip a spec's **State** (and move its entry to the right chapter) once it ships.
- Moving the spec/design file out of `docs/specs/` — files stay put; only the `State:` changes.

See also the [`authoring-docs`](../authoring-docs/SKILL.md) skill for the naming convention and where
each doc type lives.

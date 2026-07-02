# Spec: Migrate bk2 → okr / openkring

**Date:** 2026-07-02
**Status:** Draft — awaiting implementation
**Author:** Bruno Kaiser (with Claude)

## 1. Purpose & Why

Rebrand and restructure the current `bk2` monorepo to its final identity, **openkring** (the
open-source project) / **okr** (its abbreviation), and split it into a **public open-source core**
plus **private, per-tenant/app and internal submodules**.

Goals:

1. Replace all `bk` / `bk2` project-and-brand identifiers with `okr` throughout the codebase.
2. Rename the project itself from `bk2` to `okr`.
3. Publish a **public** `openkring/okr` repository containing only the open-source core, with a
   git history that has **never** contained private application code, planning docs, or secrets.
4. Move the tenant apps and brand websites out of the core into **private per-app git submodules**.
5. Move private internal content (specs/plans/ideas + skills + video-generation scripts) into
   **private git submodules** so it remains visible in the local VSCode/Claude session but not to
   the public.
6. Keep the existing `bk2` checkout and GitHub repo **untouched** during the migration as a
   reference/backup; `bk2` becomes a private archive afterwards.

Non-goals:

- No functional/behavioural change to the application.
- No database schema change and no Firestore data migration (see §5).
- No change to Firebase project ids, hosting targets, or collection names.

## 2. Locked Decisions

| # | Decision | Choice |
|---|----------|--------|
| D1 | Rename depth | **Deep rename** — brand *and* structural identifiers. |
| D2 | `bkey` target | Rename `bkey` → **`okey`**. (`key` rejected — see §5.) |
| D3 | Public core content | `libs/` + `tools/` + `apps/functions` + Firestore rules/indexes + root config. |
| D4 | Private apps | Tenant apps + brand websites → **per-app private submodules** under `bkaiser-org`. |
| D5 | Private planning | `specs` + `plans` + `ideas` + `PENDING_IMPLEMENTATION.md` + video-producer scripts → **one** private submodule `bkaiser-org/okr-planning`, mounted at `planning/`. |
| D6 | Private skills | `.claude/skills` → private submodule `bkaiser-org/okr-skills`. |
| D7 | Public docs | `docs/` keeps **only `.md` + assets**. No video binaries (published to YouTube; `.md` links out). |
| D8 | GitHub org | `openkring` org exists; public repo = `openkring/okr`; private repos under `bkaiser-org`. |
| D9 | Working location | Do all work in a fresh clone at `~/proj/bkaiser/okr`; leave `~/proj/bkaiser/bk2` untouched. |
| D10 | Old repo fate | `bkaiser-org/bk2` set **private** (archive). Deletion optional, only after full verification. |
| D11 | Public history | Purge private paths from history with `git filter-repo`, **preserving** libs/functions history — *unless* the secret-history scan (§6, Phase 5) finds unremovable secrets, then fall back to a single genesis commit. |

## 3. Target Topology

```
~/proj/bkaiser/okr   →  openkring/okr   (PUBLIC, purged history)
├── libs/  tools/  apps/functions/                     public core
├── firestore.rules  firestore.indexes.json  storage.rules
├── firebase.json  nx.json  package.json  tsconfig.base.json  (etc.)
├── docs/                    PUBLIC: .md + assets only (links to YouTube)
├── planning/          → bkaiser-org/okr-planning   (PRIVATE submodule)
│     └── specs/  plans/  ideas/  PENDING_IMPLEMENTATION.md  video-producer/
├── .claude/skills     → bkaiser-org/okr-skills      (PRIVATE submodule)
└── apps/
      ├── scs-app       → bkaiser-org/scs-app        (PRIVATE submodule)
      ├── scs-website   → bkaiser-org/scs-website    (PRIVATE submodule)
      ├── p13-website   → bkaiser-org/p13-website    (PRIVATE submodule)
      ├── kring-website → bkaiser-org/kring-website  (PRIVATE submodule)
      └── okr-website   → bkaiser-org/okr-website    (PRIVATE submodule)

~/proj/bkaiser/bk2   →  bkaiser-org/bk2 (PRIVATE archive, untouched until end)
```

Private repos total: 5 apps + `okr-planning` + `okr-skills` = **7**.

`.gitmodules` in the public repo names the private submodules; public cloners without access get
empty directories (existence is revealed, content is not — accepted).

## 4. Rename Inventory (scope of the deep rename)

Measured against the current tree. Each row is a codemod pass with its own verification gate.

| Category | From → To | Approx. scale | Notes |
|---|---|---|---|
| Import alias namespace | `@bk2/*` → `@okr/*` | 211 tsconfig paths, ~1019 import sites, every lib `package.json` `name` | Largest, mechanical. |
| Doc-id field | `bkey` → `okey` | ~981 `.bkey` sites, ~40 model decls, 5 `idField:` sites, strip-before-write deletes | Code-only, no data migration (§5). |
| Component selectors | `bk-*` → `okr-*` | ~224 distinct (`selector:`, templates, 2 scss files) | Verify no global CSS elsewhere. |
| Class / type names | `Bk*` → `Okr*` | 9: `BkModel`, `BkModels`, `BkRoot`, `BkEnvironment`, `BkAvatar`, `BkEditor`, `BkListSkeleton`, `BkLabelSelectModal`, `BkSpinnerName` | |
| Helper fn names | `bk<X>` → `okr<X>` | 11: `bkError`, `bkTranslate`, `bkPrompt`, `bkComment`, `bkValue`, `bkSearch`, `bkSearchCity`, `bkShowToast`, `bkQuickEntry`, `bkAutofocus`, `bkFocus` | |
| Brand / project text | `bk2` → `okr`, `bkaiser-org` → `openkring` (repo refs), project name in `nx.json` / root `package.json` / README | thousands of text hits | Curated; see exclusions. |
| Root `*.md` triage | each of AUTH.md, BEXIO.md, INVOICE.md, APPARCH.md, ERROR_MONITORING.md, FCM_SETUP_GUIDE.md, FEATURES.md, OVERVIEW.md, OPERATIONS.md, README.md | ~12 files | Sort each → public `docs/` (rewritten) or private `planning/`. |

### Exclusion list (MUST NOT be renamed)

The rename must **not** touch infrastructure/data identifiers:

- Firebase project ids and `.firebaserc`.
- Firebase Hosting target/site names in `firebase.json`.
- Firestore collection names and document-field names that are **stored** (e.g. `personKey`,
  `orgKey`, `memberKey`, `parentKey`, `folderKeys`, and every stored `key` field).
- Any secret/env var names read by `set-env.js` / GCP Secret Manager.
- `**/bk-config.ts` filename pattern in `.gitignore` (verify whether it must become `okr-config.ts`;
  if so, update the ignore rule together with the file, but treat as config, not brand text).

## 5. Data & Schema Consequences of `bkey` → `okey`

**No Firestore data migration is required, and no schema changes.**

- `bkey` is the in-memory document-id field only. On read it is re-attached via rxfire
  `{ idField: 'bkey' }` (`libs/shared/data-access/src/lib/firestore.service.ts:187,438,477`); on write
  it is `delete`d before persisting (`:100,257`). **No Firestore document contains a `bkey` field.**
- Renaming it changes only in-memory code: model declarations, `.bkey` accesses, the `idField:` values,
  and the strip-before-write deletes. Document ids are unchanged.
- **Foreign-key fields are untouched** — `personKey`, `orgKey`, `memberKey`, `parentKey`, `folderKeys`,
  etc. do not start with `bk`, so their names and stored values are unchanged.
- **`key` was rejected**: ≥7 models already store a distinct field named `key` (`i18n-tenant-override`,
  `i18n-default`, `website-content`, `form-definition`, `db-query`, `avatar-info`, `section`). Using
  `{ idField: 'key' }` would overwrite the stored `key` value with the document id on every read —
  silent data corruption. `okey` is collision-free (confirmed absent from the codebase).

## 6. Phased Plan (dependency-ordered)

All work happens in `~/proj/bkaiser/okr`, a fresh clone of `bk2`. `bk2` stays untouched until Phase 7.

### Phase 0 — Safety net & baseline
- Fresh clone: `git clone <bk2> ~/proj/bkaiser/okr` (bk2 remains the reference).
- Tag the starting point in the clone: `pre-okr-migration`.
- Capture a **green baseline**: `pnpm install`, build all apps + libs + functions, `tsc --noEmit`
  across libs, `pnpm run testlibs`, `pnpm run lint`. Record results.
- Commit this rename spec + a generated rename inventory (the grep counts in §4) as the source of truth.

**Gate:** baseline is green and recorded. **Depends on:** —

### Phase 1 — Untrack transient directories
- `git rm -r --cached` and add to `.gitignore`: `.codegraph`, `test-results`, stale `.superpowers`
  tracked files, `.continue`, `.idx`, non-whitelisted `.vscode/*`.
- Confirm the already-ignored ones (`.angular`, `.firebase`, `.nx`, `dist`, `tmp`, `playwright-report`)
  need no action.

**Gate:** `git status` clean; tree builds. **Depends on:** Phase 0.

### Phase 2 — The rename (atomic, repo still private)
Ordered by blast radius; each sub-step is a codemod + its own verification gate. Prefer `git mv` for
file renames and scripted find/replace (ripgrep + `sed`/`comby`/ts-morph) for identifiers.

- **2a Namespace:** `@bk2/*` → `@okr/*` — `tsconfig.base.json` (211 paths), every lib `package.json`
  `name`, all import sites. Gate: `tsc --noEmit` per lib + `nx build` for a representative app.
- **2b Structural:** `bkey`→`okey` (incl. `idField:` + strip deletes); `bk-*`→`okr-*` selectors (incl.
  `selector:`, templates, scss); `Bk*`→`Okr*` classes; `bk<X>`→`okr<X>` fns. One pass per identifier
  class, each gated by build + type-check.
- **2c Brand/text + doc triage:** `bk2`→`okr`, `bkaiser-org`→`openkring` repo refs, project name in
  `nx.json`/`package.json`/README. Triage root `*.md` (§4) into public `docs/` (rewritten) vs private
  `planning/`. Update the `docs/specs`→`planning/specs` convention in `CLAUDE.md` and the
  `authoring-docs` skill; fix PENDING backlinks.
- **2d Full gate:** build all apps + libs + functions; `pnpm run testlibs`; `pnpm run lint`; e2e smoke.
  Apply the **exclusion list** (§4) — verify no Firebase ids / rules / collection names changed.

**Gate:** full green build/test/lint; exclusion list respected. **Depends on:** Phase 1.

### Phase 3 — Reorganise directories for the split (still one repo)
- Create `planning/` and `git mv docs/specs docs/plans docs/ideas docs/PENDING_IMPLEMENTATION.md` into
  it; move the video-producer pipeline (`docs/documentation/videos/_producer` and storyboards) into
  `planning/video-producer/`; git-ignore rendered `.mp4` outputs.
- Reduce `docs/` to public `.md` + assets (curated in 2c).
- Leave `.claude/skills` in place (becomes a submodule in Phase 5) but confirm it is otherwise
  self-contained.

**Gate:** tree builds; references to moved docs updated. **Depends on:** Phase 2.

### Phase 4 — Produce the private repos via history rewrite
Operate on **mirror clones** so `filter-repo` can rewrite history safely.

- **Per app** (`scs-app`, `scs-website`, `p13-website`, `kring-website`, `okr-website`):
  `git filter-repo --path apps/<app>` (history preserved), create private `bkaiser-org/<app>`, push.
- **Planning:** `git filter-repo --path planning` → create private `bkaiser-org/okr-planning`, push.
- **Skills:** `git filter-repo --path .claude/skills` → create private `bkaiser-org/okr-skills`, push.

**Gate:** each private repo clones, and (for apps) builds against `@okr/*` once wired.
**Depends on:** Phase 3.

### Phase 5 — Produce the purged public core + secret scan
- On a mirror clone, `git filter-repo --invert-paths` removing **all** private paths from **all**
  history: every `apps/<private-app>`, `planning/`, `.claude/skills` (and any triaged-private docs).
- **⚠️ Secret-history scan (mandatory gate):** run `gitleaks detect` and/or `trufflehog` over the
  **entire** purged history. If clean → keep the filtered history (D11). If unremovable secrets exist
  → fall back to a **single genesis commit** for the public core.
- The result is the tree that will become `openkring/okr`.

**Gate:** secret scan passes (or genesis fallback applied); public core builds standalone
(`libs` + `functions`). **Depends on:** Phase 4.

### Phase 6 — Wire submodules & publish
- In the purged public core, add submodules pointing at the private repos:
  `apps/<app>` → `bkaiser-org/<app>`, `planning/` → `okr-planning`, `.claude/skills` → `okr-skills`.
  `functions` stays inline.
- Rewire `pnpm-workspace.yaml`, `nx.json` project graph, and tsconfig references so submodule apps
  build against the `@okr/*` libs from the core.
- Create the **public** `openkring/okr` repo, push the purged core.
- Set `bkaiser-org/bk2` **private** (archive).
- Update Firebase/CI/remotes (`origin`), and any repo references in deploy config.

**Gate:** `openkring/okr` is public and contains no private paths in history or tree.
**Depends on:** Phase 5.

### Phase 7 — Cutover verification & cleanup
- **Fresh clone** of `openkring/okr` in a clean location; `git submodule update --init --recursive`
  with `bkaiser-org` credentials; `pnpm install`; full build/test of core + every app.
- Firebase deploy smoke test (hosting + functions + rules) from the new checkout.
- Update `CLAUDE.md` / `README.md` to document the new public-core-plus-private-submodules topology and
  the contributor onboarding (which submodules a public contributor can vs cannot fetch).
- Tag `okr-v1`.
- Optionally delete the local `~/proj/bkaiser/bk2` and/or the `bkaiser-org/bk2` repo (owner's call).

**Gate:** fresh clone builds, deploys, and runs; docs updated. **Depends on:** Phase 6.

## 7. Dependencies (summary)

```
0 → 1 → 2 → 3 → 4 → 5 → 6 → 7   (mostly linear)
             └ within 4: the 7 filter-repo exports are independent (parallelizable)
```

The rename (2) is atomic and precedes any split (3–5): splitting first would force every rename to be
coordinated across 8 repos. History purge (4–5) precedes publish (6): submodule wiring alone does not
remove private paths from past commits.

## 8. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Secrets in git history exposed on public push | Mandatory gitleaks/trufflehog scan (Phase 5); genesis-commit fallback. |
| `bkey`→`key` data corruption | Rejected; use `okey` (§5). |
| Rename touches Firebase ids/collections → broken deploy | Explicit exclusion list (§4); Phase 2d + Phase 7 deploy smoke. |
| Submodule apps fail to resolve `@okr/*` | Rewire nx/pnpm-workspace/tsconfig (Phase 6); fresh-clone build gate (Phase 7). |
| Lost libs history in public repo | Prefer filter-repo (preserves history); genesis only as secret fallback. |
| Broken doc conventions after `docs/specs`→`planning/specs` | Update CLAUDE.md + authoring-docs skill + PENDING backlinks in Phase 2c. |
| Work corrupts the reference | All work in `~/proj/bkaiser/okr`; `bk2` untouched until Phase 7. |
| Public contributor confusion (empty submodule dirs) | Document topology + onboarding in Phase 7. |

## 9. Open Questions

- **Video-producer coupling:** confirm the `_producer` pipeline has no hard dependency on the old
  `docs/documentation/videos/` path once moved under `planning/video-producer/`.
- **`bk-config.ts` ignore pattern:** decide whether the config filename becomes `okr-config.ts`
  (config, not brand text — verify usages before changing).
- **CI provider:** identify any CI/CD (GitHub Actions, etc.) referencing `bkaiser-org/bk2` or `@bk2/*`
  that must be updated in Phase 6.

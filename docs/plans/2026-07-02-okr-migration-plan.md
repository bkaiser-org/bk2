# bk2 → okr / openkring Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebrand the `bk2` monorepo to `okr`/openkring and split it into a public `openkring/okr` core plus private per-app / planning / skills git submodules, with a history that never exposes private content or secrets.

**Architecture:** All work happens in a fresh clone at `~/proj/bkaiser/okr`; the existing `~/proj/bkaiser/bk2` stays untouched as backup. Do the entire deep rename **atomically while the repo is one monorepo**, then split via `git filter-repo` into history-clean repos, then publish the purged core with submodules wired.

**Tech Stack:** Nx, Angular 20, pnpm, Firebase, `git filter-repo`, `perl`/`ripgrep` codemods, `gitleaks`/`trufflehog`.

**Source spec:** [`2026-07-02-okr-migration-spec.md`](../specs/2026-07-02-okr-migration-spec.md). Read its §4 inventory and §4 exclusion list before starting.

---

## Conventions used in this plan

- **Codemods use `perl` for word-boundary safety** — macOS/BSD `sed` does not support `\b`. `perl -pi -e` edits in place.
- **Never rename the literal string `bkaiser-org`** (Firebase project id + GitHub org) or `bkaiser.imgix.net`. Every codemod that could touch them excludes config/env files or uses a pattern that cannot match them.
- **Verification gate = the test.** A task is not "done" until its gate command prints the expected success and the commit is made.
- Branch is `main` throughout.
- Baseline env for gates: `nvm use 22.22.1` when touching functions (per project memory); `pnpm install` after any `package.json`/scope change.

## File / directory map (what ends up where)

| Path (in final public core) | Fate |
|---|---|
| `libs/**`, `tools/**`, `apps/functions/**` | Public core (inline). |
| `firestore.rules`, `firestore.indexes.json`, `storage.rules`, `firebase.json`, `nx.json`, root `package.json`, `tsconfig.base*.json` | Public core (inline). |
| `docs/**` (`.md` + assets only) | Public core (inline). |
| `apps/scs-app`, `apps/scs-website`, `apps/p13-website`, `apps/kring-website`, `apps/okr-website` | Private submodules → `bkaiser-org/<app>`. |
| `planning/` (specs, plans, ideas, PENDING, video-producer) | Private submodule → `bkaiser-org/okr-planning`. |
| `.claude/skills` | Private submodule → `bkaiser-org/okr-skills`. |

---

## Phase 0 — Safety net & baseline

### Task 0.1: Fresh clone + green baseline + tag

**Files:** none edited; new working copy created.

- [ ] **Step 1: Clone bk2 into the okr working dir (leaves bk2 untouched)**

```bash
git clone ~/proj/bkaiser/bk2 ~/proj/bkaiser/okr
cd ~/proj/bkaiser/okr
git remote remove origin   # detach from bkaiser-org/bk2 so nothing pushes there by accident
```

- [ ] **Step 2: Tag the starting point**

```bash
git tag pre-okr-migration
```

- [ ] **Step 3: Install and capture a green baseline**

```bash
nvm use 22.22.1
pnpm install
pnpm nx run-many --target=build --all --configuration=production 2>&1 | tee /tmp/okr-baseline-build.log
pnpm run testlibs 2>&1 | tee /tmp/okr-baseline-test.log
```
Expected: all builds succeed; tests pass. If anything is red **stop** — the baseline must be green before any rename (otherwise you cannot attribute later breakage to the migration).

- [ ] **Step 4: Verify git-filter-repo and secret scanners are installed**

```bash
git filter-repo --version   # if missing: brew install git-filter-repo
gitleaks version            # if missing: brew install gitleaks
```
Expected: both print versions.

- [ ] **Step 5: Commit the baseline marker**

```bash
git commit --allow-empty -m "chore(okr): baseline before migration (build+test green)"
```

---

## Phase 1 — Untrack transient directories

### Task 1.1: Stop tracking regenerable/editor dirs

**Files:** Modify `.gitignore`; untrack `.codegraph`, `test-results`, `.continue`, `.idx`, stray `.superpowers`, non-whitelisted `.vscode/*`.

- [ ] **Step 1: Append ignore rules** (only those not already present)

```bash
cd ~/proj/bkaiser/okr
cat >> .gitignore <<'EOF'

# okr migration: untrack transient / editor dirs
.codegraph/
test-results/
.continue/
.idx/
EOF
```

- [ ] **Step 2: Remove them from the index (keep on disk)**

```bash
git rm -r --cached .codegraph test-results .continue .idx 2>/dev/null
git ls-files .superpowers | xargs -r git rm --cached
git ls-files '.vscode/*' | grep -vE '\.vscode/(settings|tasks|launch|extensions)\.json' | xargs -r git rm --cached
```

- [ ] **Step 3: Verify the tree still builds and status is sane**

Run: `git status --short && pnpm nx build shared-util-core`
Expected: only deletions/`.gitignore` staged; build succeeds.

- [ ] **Step 4: Commit**

```bash
git add .gitignore
git commit -m "chore(okr): untrack transient and editor directories"
```

---

## Phase 2 — The rename (atomic, repo still private)

> Each sub-task ends with a build/type gate. After the whole phase, Task 2.7 runs the full gate. Keep commits small so a bad codemod is easy to revert.

### Task 2.1: Namespace + Nx scope (`@bk2/*` → `@okr/*`, `npmScope` → `okr`)

**Files:** `nx.json`; `tsconfig.base.json`; `tsconfig.base.build.json`; `libs/shared/util-core/tsconfig.lib.json`; every `package.json` with a `@bk2/` name; 3 `vite/vitest.config.*` with `@bk2` mappers; all `*.ts` import sites.

- [ ] **Step 1: Change the Nx npm scope (root cause of the alias)**

```bash
cd ~/proj/bkaiser/okr
perl -pi -e 's/"npmScope":\s*"bk2"/"npmScope": "okr"/' nx.json
grep npmScope nx.json    # expect: "npmScope": "okr",
```

- [ ] **Step 2: Rewrite every `@bk2/` reference across code + config**

```bash
grep -rl '@bk2/' --include='*.ts' --include='*.json' --include='*.mts' \
  --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist \
  libs apps tools tsconfig.base.json tsconfig.base.build.json package.json 2>/dev/null | \
  xargs perl -pi -e 's{\@bk2/}{\@okr/}g'
```
(`--exclude-dir=.git` is essential — never let a codemod edit git internals.) This covers all path maps (`tsconfig.base.json`, `tsconfig.base.build.json`, `libs/shared/util-core/tsconfig.lib.json`), every lib `package.json` `name`, the vite/vitest mappers, and ~1019 import sites in one pass. `@bk2/` cannot match `bkaiser-org`, so the exclusion is automatic.

- [ ] **Step 3: Confirm nothing named `@bk2/` remains**

Run: `grep -rn '@bk2/' --include='*.ts' --include='*.json' libs apps tools . 2>/dev/null | grep -v node_modules | wc -l`
Expected: `0`.

- [ ] **Step 4: Reinstall (package names + workspace links changed) and type-check**

```bash
pnpm install
pnpm nx run-many --target=build --projects=shared-util-core,shared-models,shared-config
```
Expected: builds succeed (proves the new `@okr/*` resolution works end-to-end).

- [ ] **Step 5: Sanity-check the generator uses the new scope, then discard**

```bash
pnpm nx g @nx/js:lib tmp-scope-check --directory=libs/tmp --dry-run 2>&1 | grep -i '@okr/tmp-scope-check'
```
Expected: dry-run output references `@okr/…` (not `@bk2/…`). No files written.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(okr): rename @bk2 -> @okr namespace and nx npmScope"
```

### Task 2.2: `bkey` → `okey`

**Files:** all `*.ts` under `libs` and `apps` referencing `bkey`, incl. `libs/shared/data-access/src/lib/firestore.service.ts` (`idField:'bkey'` + strip-before-write deletes) and ~40 model declarations.

- [ ] **Step 1: Word-boundary replace `bkey` → `okey`**

```bash
cd ~/proj/bkaiser/okr
grep -rl '\bbkey\b' --include='*.ts' libs apps 2>/dev/null | \
  xargs perl -pi -e 's/\bbkey\b/okey/g'
# comment-only plural, for consistency:
grep -rl '\bbkeys\b' --include='*.ts' libs apps 2>/dev/null | \
  xargs perl -pi -e 's/\bbkeys\b/okeys/g'
```

- [ ] **Step 2: Verify the two `idField` sites and the strip deletes were rewritten**

Run: `grep -rn "idField: 'okey'\|delete .*\.okey\|\.okey = " libs/shared/data-access/src/lib/firestore.service.ts`
Expected: `idField: 'okey'` appears (was `'bkey'`); strip/delete lines now use `okey`.

- [ ] **Step 3: Confirm no `bkey` remains**

Run: `grep -rn '\bbkey\b' --include='*.ts' libs apps | wc -l`
Expected: `0`.

- [ ] **Step 4: Type-check the touched domains**

```bash
pnpm nx run-many --target=build --projects=shared-models,shared-data-access,user-feature,cms-page-feature
```
Expected: builds succeed.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(okr): rename in-memory doc-id field bkey -> okey (no data migration)"
```

### Task 2.3: Selectors `bk-*` → `okr-*` **coupled with** `project.json` prefix

**Files:** all `*.ts` (`selector:` + inline templates) and `*.html` with `<bk-`/`</bk-`; 2 `*.scss` files; all 209 `project.json` (`"prefix": "bk"`).

- [ ] **Step 1: Flip the enforced Angular selector prefix in every project.json**

```bash
cd ~/proj/bkaiser/okr
grep -rl '"prefix": "bk"' --include='project.json' libs apps | \
  xargs perl -pi -e 's/"prefix":\s*"bk"/"prefix": "okr"/'
grep -rc '"prefix": "bk"' --include='project.json' libs apps | grep -v ':0' | wc -l
```
Expected last line: `0` (no project.json still says `"bk"`).

- [ ] **Step 2: Rewrite element selectors in templates and `selector:` declarations**

```bash
# element open/close tags in templates and inline template strings
grep -rlE '</?bk-' --include='*.ts' --include='*.html' libs apps | \
  xargs perl -pi -e 's{(</?)bk-}{${1}okr-}g'
# @Component/@Directive selector: 'bk-...'
grep -rlE "selector:\s*['\"]bk-" --include='*.ts' libs apps | \
  xargs perl -pi -e "s/(selector:\s*['\"])bk-/\${1}okr-/g"
# scss element selectors
grep -rlE '(^|[^a-z-])bk-' --include='*.scss' libs apps | \
  xargs perl -pi -e 's/(^|[^a-z-])bk-/${1}okr-/g'
```

- [ ] **Step 3: Confirm no `bk-` element selectors remain**

Run: `grep -rnE '</?bk-|selector:\s*['"'"'"]bk-' --include='*.ts' --include='*.html' libs apps | wc -l`
Expected: `0`. (If a directive uses an attribute selector like `[bkFoo]`, it is camelCase and handled in Task 2.5, not here.)

- [ ] **Step 4: Build + lint a representative app (lint enforces the prefix/selector agreement)**

```bash
pnpm nx build scs-app
pnpm nx lint shared-ui
```
Expected: build succeeds; lint passes (selectors now `okr-*` and prefix now `okr` agree).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(okr): rename bk-* selectors -> okr-* and project.json prefix bk -> okr"
```

### Task 2.4: `Bk*` class/type names + `bk-root.ts` file rename

**Files:** all `*.ts` using the 9 names `BkModel, BkModels, BkRoot, BkEnvironment, BkAvatar, BkEditor, BkListSkeleton, BkLabelSelectModal, BkSpinnerName`; rename `apps/<app>/**/bk-root.ts` → `okr-root.ts`.

- [ ] **Step 1: Rename the class/type identifiers (whole word)**

```bash
cd ~/proj/bkaiser/okr
for n in BkModels BkModel BkRoot BkEnvironment BkAvatar BkEditor BkListSkeleton BkLabelSelectModal BkSpinnerName; do
  new="Okr${n#Bk}"
  grep -rl "\b$n\b" --include='*.ts' libs apps | xargs -r perl -pi -e "s/\b$n\b/$new/g"
done
```
(Order matters: `BkModels` before `BkModel` so the longer name is replaced first.)

- [ ] **Step 2: `git mv` the bk-root files**

```bash
for f in $(find apps -name 'bk-root.ts' -not -path '*/node_modules/*'); do
  git mv "$f" "$(dirname "$f")/okr-root.ts"
done
```

- [ ] **Step 3: Confirm no `Bk<Name>` identifiers or `bk-root` filenames remain**

Run: `grep -rnE '\bBk[A-Z]' --include='*.ts' libs apps | wc -l; find apps -name 'bk-root.ts' | wc -l`
Expected: `0` and `0`.

- [ ] **Step 4: Build the apps (root component wiring changed)**

```bash
pnpm nx run-many --target=build --projects=scs-app,okr-website,kring-website
```
Expected: builds succeed.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(okr): rename Bk* classes -> Okr* and bk-root.ts -> okr-root.ts"
```

### Task 2.5: Helper functions `bk<X>` → `okr<X>`

**Files:** all `*.ts` using the 11 names `bkError, bkTranslate, bkPrompt, bkComment, bkValue, bkSearch, bkSearchCity, bkShowToast, bkQuickEntry, bkAutofocus, bkFocus`.

- [ ] **Step 1: Rename the function identifiers (whole word, longer names first)**

```bash
cd ~/proj/bkaiser/okr
for n in bkSearchCity bkSearch bkError bkTranslate bkPrompt bkComment bkValue bkShowToast bkQuickEntry bkAutofocus bkFocus; do
  new="okr$(perl -e "print ucfirst('${n#bk}')")"
  grep -rl "\b$n\b" --include='*.ts' libs apps | xargs -r perl -pi -e "s/\b$n\b/$new/g"
done
```
(`bkSearchCity` before `bkSearch` so the longer name wins.)

- [ ] **Step 2: Confirm no `bk<lowercaseCamel>` helper names remain**

Run: `grep -rnE '\bbk[A-Z]' --include='*.ts' libs apps | wc -l`
Expected: `0`.

- [ ] **Step 3: Build the domains that use these helpers**

```bash
pnpm nx run-many --target=build --projects=shared-util-angular,shared-ui,shared-feature
```
Expected: builds succeed.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(okr): rename bk* helper functions -> okr*"
```

### Task 2.6: Brand text `bk2` → `okr`, `okr-config.ts`, doc triage

**Files:** `nx.json`, root `package.json`, README + root `*.md`; `.gitignore` (`bk-config.ts` pattern); text hits of `bk2` (excluding repository URLs and `bkaiser-org`).

- [ ] **Step 1: Replace the `bk2` project token in code/config, protecting repo URLs and `bkaiser-org`**

```bash
cd ~/proj/bkaiser/okr
# never let bk2 inside a repo path (bkaiser-org/bk2) or the org name be touched:
grep -rl '\bbk2\b' --include='*.ts' --include='*.json' --include='*.md' --include='*.scss' \
  libs apps tools docs *.json *.md 2>/dev/null | grep -v node_modules | \
  xargs perl -pi -e 's{(?<!bkaiser-org/)\bbk2\b}{okr}g'
```
The negative look-behind `(?<!bkaiser-org/)` leaves `bkaiser-org/bk2` (the git remote path) intact; those URLs are set per-repo in Phase 6.

- [ ] **Step 2: Rename the git-ignored config file pattern and any local file**

```bash
perl -pi -e 's{bk-config\.ts}{okr-config.ts}g' .gitignore
find . -name 'bk-config.ts' -not -path '*/node_modules/*' -exec bash -c 'git mv "$0" "$(dirname "$0")/okr-config.ts" 2>/dev/null || mv "$0" "$(dirname "$0")/okr-config.ts"' {} \;
```

- [ ] **Step 3: Triage root `*.md` — move internal-detail docs to `planning/`, keep public ones in `docs/`**

```bash
mkdir -p planning
# internal architecture/integration detail -> private planning
git mv AUTH.md BEXIO.md INVOICE.md ERROR_MONITORING.md FCM_SETUP_GUIDE.md OPERATIONS.md APPARCH.md planning/ 2>/dev/null
# public-facing -> docs/ (rewrite content later as needed)
git mv OVERVIEW.md FEATURES.md docs/ 2>/dev/null
# README.md stays at repo root
```
(Adjust the split to taste; the rule is: anything exposing internal infra/keys/process goes to `planning/`.)

- [ ] **Step 4: Verify exclusions held (Firebase id, imgix, repo URLs untouched)**

```bash
grep -rn 'bkaiser-org' .firebaserc | grep -q '"default": "bkaiser-org"' && echo "firebase id OK"
grep -rc 'bkaiser.imgix.net' --include='*.ts' libs apps | grep -v ':0' | wc -l   # expect >0, unchanged
grep -rn '\bbk2\b' --include='*.ts' --include='*.json' libs apps tools | grep -v node_modules | wc -l  # expect 0
```
Expected: `firebase id OK`; imgix count unchanged; zero remaining `bk2` tokens in code.

- [ ] **Step 5: Update the doc-path convention in CLAUDE.md + authoring-docs skill (`docs/specs` → `planning/specs`)**

```bash
grep -rl 'docs/specs\|docs/plans\|docs/ideas' CLAUDE.md .claude/skills/authoring-docs 2>/dev/null | \
  xargs perl -pi -e 's{docs/(specs|plans|ideas)}{planning/$1}g'
```
Then fix the PENDING backlinks in Step 6's move (handled in Phase 3).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(okr): rebrand bk2 text -> okr, okr-config.ts, triage root docs"
```

### Task 2.7: Full verification gate for the rename

**Files:** none — gate only.

- [ ] **Step 1: Reinstall + full build (all apps, libs, functions)**

```bash
cd ~/proj/bkaiser/okr
nvm use 22.22.1
pnpm install
pnpm nx run-many --target=build --all --configuration=production 2>&1 | tee /tmp/okr-rename-build.log
```
Expected: every project builds. Diff `/tmp/okr-rename-build.log` project list against `/tmp/okr-baseline-build.log` — same set, all green.

- [ ] **Step 2: Tests + lint**

```bash
pnpm run testlibs
pnpm nx run-many --target=lint --all
```
Expected: tests pass; lint passes (proves selector/prefix agreement across all libs).

- [ ] **Step 3: Serve smoke test (runtime selectors resolve)**

```bash
pnpm nx serve scs-app &  # open the served URL, confirm the app renders (okr-* selectors resolve at runtime)
```
Expected: app boots and renders; no "unknown element okr-…" console errors. Stop the server.

- [ ] **Step 4: Tag the completed rename**

```bash
git tag okr-rename-complete
```

---

## Phase 3 — Reorganise directories for the split

### Task 3.1: Create `planning/`, move private docs + video-producer, slim `docs/`

**Files:** `git mv docs/specs docs/plans docs/ideas docs/PENDING_IMPLEMENTATION.md` → `planning/`; move the video-producer pipeline; git-ignore rendered videos.

- [ ] **Step 1: Move planning content into `planning/`**

```bash
cd ~/proj/bkaiser/okr
mkdir -p planning
git mv docs/specs planning/specs
git mv docs/plans planning/plans
git mv docs/ideas planning/ideas
git mv docs/PENDING_IMPLEMENTATION.md planning/PENDING_IMPLEMENTATION.md
```

- [ ] **Step 2: Move the video-producer pipeline, ignore rendered mp4 outputs**

```bash
mkdir -p planning/video-producer
git mv docs/documentation/videos/_producer/* planning/video-producer/ 2>/dev/null
# any storyboards / script.md under videos:
git mv docs/documentation/videos planning/video-producer/videos 2>/dev/null
cat >> .gitignore <<'EOF'

# okr: rendered helper videos are published to YouTube, not git
planning/video-producer/**/*.mp4
EOF
git rm -r --cached --ignore-unmatch 'planning/video-producer/**/*.mp4'
```

- [ ] **Step 3: Reduce `docs/` to public `.md` + assets**

```bash
# docs/ should now hold only public reference md + assets; verify nothing private is left
ls -R docs
```
Expected: no specs/plans/ideas/videos remain under `docs/`.

- [ ] **Step 4: Fix internal links to moved docs**

```bash
grep -rl 'docs/specs\|docs/plans\|docs/ideas\|docs/PENDING' --include='*.md' planning docs *.md 2>/dev/null | \
  xargs perl -pi -e 's{docs/(specs|plans|ideas)}{planning/$1}g; s{docs/PENDING}{planning/PENDING}g'
```

- [ ] **Step 5: Verify the workspace still builds (no code path depended on docs/)**

Run: `pnpm nx build shared-util-core`
Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore(okr): move specs/plans/ideas + video-producer into planning/, slim docs/"
git tag okr-reorg-complete
```

---

## Phase 4 — Produce the private repos via history rewrite

> Each export is an independent clone + `git filter-repo`. These 7 tasks can run in any order (parallelizable). `filter-repo` requires a fresh clone and auto-removes the origin.

### Task 4.1: Export the 5 app repos (history preserved, prefix stripped)

**Files:** creates `bkaiser-org/scs-app`, `scs-website`, `p13-website`, `kring-website`, `okr-website`.

- [ ] **Step 1: For each app, filter to just that path and strip the `apps/<app>/` prefix**

```bash
for app in scs-app scs-website p13-website kring-website okr-website; do
  rm -rf /tmp/export-$app
  git clone ~/proj/bkaiser/okr /tmp/export-$app
  ( cd /tmp/export-$app
    git filter-repo --path apps/$app --path-rename apps/$app/: )
done
```
Expected: each `/tmp/export-$app` contains the app's files at its root, with only commits that touched that app.

- [ ] **Step 2: Create the private repos and push**

```bash
for app in scs-app scs-website p13-website kring-website okr-website; do
  gh repo create bkaiser-org/$app --private --source=/tmp/export-$app --remote=origin --push
done
```
Expected: 5 private repos created and populated.

- [ ] **Step 3: Verify each private repo has no unrelated paths in history**

```bash
for app in scs-app scs-website p13-website kring-website okr-website; do
  echo "== $app =="; ( cd /tmp/export-$app; git log --all --name-only --pretty=format: | grep -v "^$" | sort -u | grep -E '^(libs|planning|\.claude|apps)/' | head )
done
```
Expected: no `libs/`, `planning/`, `.claude/`, or other apps' paths — only the app's own files.

### Task 4.2: Export `okr-planning` (specs, plans, ideas, PENDING, video-producer)

- [ ] **Step 1: Filter to `planning/`, strip prefix**

```bash
rm -rf /tmp/export-planning
git clone ~/proj/bkaiser/okr /tmp/export-planning
( cd /tmp/export-planning
  git filter-repo --path planning --path-rename planning/: )
```

- [ ] **Step 2: Create + push the private repo**

```bash
gh repo create bkaiser-org/okr-planning --private --source=/tmp/export-planning --remote=origin --push
```

- [ ] **Step 3: Verify contents**

Run: `ls /tmp/export-planning` → expect `specs plans ideas PENDING_IMPLEMENTATION.md video-producer`.

### Task 4.3: Export `okr-skills`

- [ ] **Step 1: Filter to `.claude/skills`, strip prefix**

```bash
rm -rf /tmp/export-skills
git clone ~/proj/bkaiser/okr /tmp/export-skills
( cd /tmp/export-skills
  git filter-repo --path .claude/skills --path-rename .claude/skills/: )
```

- [ ] **Step 2: Create + push**

```bash
gh repo create bkaiser-org/okr-skills --private --source=/tmp/export-skills --remote=origin --push
```

- [ ] **Step 3: Verify contents**

Run: `ls /tmp/export-skills` → expect the skill directories (`new-feature`, `i18n`, …).

---

## Phase 5 — Purged public core + secret scan

### Task 5.1: Build the history-clean public core and scan for secrets

**Files:** produces `/tmp/export-core` — the tree that becomes `openkring/okr`.

- [ ] **Step 1: Clone and strip ALL private paths from ALL history**

```bash
rm -rf /tmp/export-core
git clone ~/proj/bkaiser/okr /tmp/export-core
( cd /tmp/export-core
  git filter-repo \
    --invert-paths \
    --path apps/scs-app --path apps/scs-website --path apps/p13-website \
    --path apps/kring-website --path apps/okr-website \
    --path planning --path .claude/skills )
```

- [ ] **Step 2: Verify no private path exists anywhere in history**

```bash
cd /tmp/export-core
git log --all --name-only --pretty=format: | sort -u | \
  grep -E '^(apps/(scs-app|scs-website|p13-website|kring-website|okr-website)|planning|\.claude/skills)/' | wc -l
```
Expected: `0`. (`apps/functions` remains — that is intended.)

- [ ] **Step 3: MANDATORY secret-history scan over the entire history**

```bash
gitleaks detect --source /tmp/export-core --log-opts="--all" --report-path /tmp/okr-gitleaks.json
```
Expected: `no leaks found`.
- If leaks are reported: **do not publish.** Either add the offending paths to the Step-1 `--invert-paths` list (if they are whole files) and re-run, or fall back to a single genesis commit:
  ```bash
  cd /tmp/export-core
  git checkout --orphan launch && git add -A && git commit -m "Open-sourced as openkring"
  git branch -D main && git branch -m main
  ```
  Re-run the gitleaks scan on the genesis result; it must be clean.

- [ ] **Step 4: Verify the purged core builds standalone (core-only projects)**

```bash
cd /tmp/export-core
nvm use 22.22.1
pnpm install
pnpm nx run-many --target=build --projects=shared-util-core,shared-models,functions
```
Expected: builds succeed (proves the public core is self-contained without the private apps).

---

## Phase 6 — Wire submodules & publish

### Task 6.1: Add private submodules to the purged core

**Files:** creates `.gitmodules`; adds submodules at `apps/<app>`, `planning/`, `.claude/skills`; rewires nx/pnpm-workspace/tsconfig.

- [ ] **Step 1: Add the submodules**

```bash
cd /tmp/export-core
for app in scs-app scs-website p13-website kring-website okr-website; do
  git submodule add git@github.com:bkaiser-org/$app.git apps/$app
done
git submodule add git@github.com:bkaiser-org/okr-planning.git planning
git submodule add git@github.com:bkaiser-org/okr-skills.git .claude/skills
```

- [ ] **Step 2: Ensure the workspace still discovers the submodule apps**

```bash
# pnpm-workspace.yaml / nx project graph must include apps/* — verify nx sees them:
pnpm install
pnpm nx show projects | grep -E 'scs-app|okr-website'
```
Expected: submodule apps appear in the Nx project list. If not, add `apps/*` globs to `pnpm-workspace.yaml` and re-run.

- [ ] **Step 3: Full build across core + submodule apps**

```bash
pnpm nx run-many --target=build --all --configuration=production
```
Expected: every project builds (core libs from the core repo, apps from submodules, resolving `@okr/*`).

- [ ] **Step 4: Commit the submodule wiring**

```bash
git add -A
git commit -m "chore(okr): mount private apps/planning/skills as git submodules"
```

### Task 6.2: Publish `openkring/okr` and archive `bk2`

- [ ] **Step 1: Create the public repo and push the purged core**

```bash
cd /tmp/export-core
gh repo create openkring/okr --public --source=. --remote=origin --push
```

- [ ] **Step 2: Set per-repo `repository` URL / README badges**

```bash
# root package.json repository -> openkring/okr
perl -pi -e 's{bkaiser-org/bk2}{openkring/okr}g' package.json README.md 2>/dev/null
git add -A && git commit -m "docs(okr): point repository metadata at openkring/okr" && git push
```

- [ ] **Step 3: Make the old repo private (archive)**

```bash
gh repo edit bkaiser-org/bk2 --visibility private --accept-visibility-change-consequences
```
Expected: `bkaiser-org/bk2` is now private. (Do not transfer or make it public.)

- [ ] **Step 4: Verify public repo has no private content**

```bash
gh api repos/openkring/okr --jq '.visibility'   # expect: public
# clone WITHOUT submodule access and confirm private dirs are empty pointers, history clean:
git clone https://github.com/openkring/okr /tmp/public-check
cd /tmp/public-check
git log --all --name-only --pretty=format: | sort -u | grep -E 'planning/|\.claude/skills/|apps/scs-app/' | wc -l  # expect 0
```
Expected: visibility `public`; `0` private paths in history.

---

## Phase 7 — Cutover verification & cleanup

### Task 7.1: Fresh full-clone build + deploy smoke

**Files:** none edited; validation only.

- [ ] **Step 1: Fresh clone with submodules (as a bkaiser-org member)**

```bash
rm -rf /tmp/okr-final
git clone --recurse-submodules git@github.com:openkring/okr.git /tmp/okr-final
cd /tmp/okr-final
git submodule status   # all 7 submodules present and checked out
```

- [ ] **Step 2: Full install + build + test**

```bash
nvm use 22.22.1
pnpm install
pnpm nx run-many --target=build --all --configuration=production
pnpm run testlibs
```
Expected: all green from a clean checkout.

- [ ] **Step 3: Firebase deploy smoke (manual, no CI)**

```bash
# generate env, then a dry hosting build + functions build (do NOT deploy prod unless intended):
source ./apps/scs-app/.env && ts-node ./set-env.js
pnpm nx build scs-app --configuration=production
pnpm nx build functions --configuration=production
```
Expected: production builds succeed against the new checkout. (Actual `firebase deploy` per the firebase-deploy skill when ready.)

- [ ] **Step 4: Tag the release**

```bash
git tag okr-v1 && git push origin okr-v1
```

### Task 7.2: Update contributor docs + finalize

**Files:** `CLAUDE.md`, `README.md`.

- [ ] **Step 1: Document the new topology and onboarding**

Add to `README.md`: the public-core-plus-private-submodules layout, that public contributors get empty `apps/*`, `planning/`, `.claude/skills` (private), and how a member runs `git clone --recurse-submodules`. Update `CLAUDE.md` "Monorepo structure" to match (apps are submodules; planning/ holds specs/plans/ideas).

- [ ] **Step 2: Commit + push**

```bash
git add CLAUDE.md README.md
git commit -m "docs(okr): document public-core + private-submodule topology and onboarding"
git push
```

- [ ] **Step 3: Point local working copy at the new remote (optional)**

```bash
cd ~/proj/bkaiser/okr
git remote add origin git@github.com:openkring/okr.git
```

- [ ] **Step 4: Final owner sign-off before deleting bk2**

Confirm: `openkring/okr` builds/deploys from a fresh clone; all 7 private submodules are populated; `okr-v1` tagged. Only then (owner's call) delete `~/proj/bkaiser/bk2` and/or `bkaiser-org/bk2`.

---

## Self-review coverage map (spec → task)

| Spec item | Task |
|---|---|
| D1 deep rename | 2.1–2.6 |
| D2 `bkey`→`okey` (+ §5 no migration, `key` rejected) | 2.2 |
| D3 public core = libs+functions+rules | 5.1, 6.1 |
| D4 per-app private submodules | 4.1, 6.1 |
| D5 planning submodule (+ video-producer) | 3.1, 4.2, 6.1 |
| D6 skills submodule | 4.3, 6.1 |
| D7 docs = md+assets, videos→YouTube | 3.1 |
| D8 openkring org / bkaiser-org private | 4.x, 6.2 |
| D9 work in copy | 0.1 |
| D10 bk2 → private archive | 6.2 |
| D11 filter-repo + secret scan + genesis fallback | 5.1 |
| §4 nx npmScope, all tsconfig path maps, 209 prefixes, vite mappers | 2.1, 2.3 |
| §4 exclusions (bkaiser-org, imgix, repo URLs) | 2.6 |
| §4 file renames (bk-root.ts, okr-config.ts) | 2.4, 2.6 |
| §1 transient-dir untrack | 1.1 |
| Cutover verify + deploy smoke | 7.1 |
| Contributor docs | 7.2 |

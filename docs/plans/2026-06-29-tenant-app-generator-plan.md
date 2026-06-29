# Tenant App Generator + CMS-Minimal Template — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a CMS-minimal app template derived from `scs-app` plus an `@bk2/tools:app` Nx generator that scaffolds `apps/{tenantId}-app` from it, such that the scaffolded app builds cleanly.

**Architecture:** A local Nx plugin (`@bk2/tools`, created via `@nx/plugin`) hosts an `app` generator. The generator copies an EJS template tree (`tools/src/generators/app/files/`) — a stripped, tenant-tokenized copy of `scs-app` containing only the bootstrap shell, auth, CMS page/section/menu, and profile/person/group — substituting `__tenantId__`/`__appName__` and writing `apps/{tenantId}-app`. The `provision-tenant` skill (separate, later deliverable) calls this generator as one step.

**Tech Stack:** Nx 21.4.1, `@nx/plugin` + `@nx/devkit` (added here), Angular 20 / Ionic, Vitest, pnpm.

**Source spec:** [docs/specs/2026-06-29-tenant-provisioning-design.md](../specs/2026-06-29-tenant-provisioning-design.md) (Components A + B only; the `provision-tenant` skill = Component C is out of scope for this plan).

---

## Scope of this plan

**In scope:** Components A (CMS-minimal template) and B (Nx generator) of the spec.

**Out of scope (separate deliverables):** the `provision-tenant` skill, Firebase Web App registration, AppConfig seeding, starter CMS content seeding, `.env` writing, website scaffolding. The generator produced here is a pure local-filesystem scaffolder — no Firebase, no secrets.

## File structure

- `tools/` — new Nx plugin project `@bk2/tools` (created by `@nx/plugin:plugin`).
  - `tools/src/generators/app/generator.ts` — the generator function.
  - `tools/src/generators/app/schema.json` — generator options schema (`tenantId`, `appName`, `force`).
  - `tools/src/generators/app/schema.d.ts` — TS type for the options.
  - `tools/src/generators/app/generator.spec.ts` — Vitest unit test.
  - `tools/src/generators/app/files/` — the EJS template tree (the CMS-minimal app).
  - `tools/generators.json` — registers the `app` generator.
- `apps/scs-app/**` — read-only source for deriving the template (never modified).

## Conventions for the template tree

- Files that are tenant-agnostic (`main.ts`, `app.config.ts`, `bk-root.ts`, `index.html`, theme, assets) are copied verbatim into `files/`, renamed with a trailing `__tmpl__` so Nx treats them as templates (e.g. `main.ts__tmpl__`). They contain no `<%= %>` tokens.
- Files with tenant literals (`project.json`, `capacitor.config.ts`) use `<%= tenantId %>` / `<%= appName %>` EJS tokens.
- The directory `apps/__tenantId__-app` is expressed in `files/` via the path `apps/__tenantId__-app/...` and `generateFiles` substitutes `__tenantId__` from the template variables.

---

## Task 1: Add Nx plugin tooling and scaffold the `@bk2/tools` plugin

**Files:**
- Modify: `package.json` (devDependencies)
- Create: `tools/` plugin project (generated)

- [ ] **Step 1: Add the two approved dev dependencies**

The versions must match the installed `nx` (21.4.1). `@nx/devkit@21.4.1` is already in the pnpm store; `@nx/plugin` will be downloaded.

Run:
```bash
pnpm add -D -w @nx/plugin@21.4.1 @nx/devkit@21.4.1
```
Expected: both resolve to 21.4.1, lockfile updates, no peer-dep errors against `nx@21.4.1`.

- [ ] **Step 2: Verify the plugin generator is available**

Run:
```bash
pnpm nx g @nx/plugin:plugin --help
```
Expected: help text prints (confirms `@nx/plugin` installed and the option flags for this version). Note the exact flag names for `directory`/`importPath` in this version — use them in Step 3 if they differ.

- [ ] **Step 3: Scaffold the plugin project at `tools/` with import path `@bk2/tools`**

Run:
```bash
pnpm nx g @nx/plugin:plugin tools --directory=tools --importPath=@bk2/tools --linter=eslint --unitTestRunner=vitest --no-interactive
```
Expected: creates `tools/` with `project.json` (name derived), `package.json` (`"name": "@bk2/tools"`), `tsconfig*`, and a `src/`. If the version rejects a flag, re-run using the flag names from Step 2's help.

- [ ] **Step 4: Confirm Nx sees the new project**

Run:
```bash
pnpm nx show project @bk2/tools 2>/dev/null || pnpm nx show project tools
```
Expected: prints the project's targets (proves it's registered).

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml tools/ tsconfig.base.json nx.json
git commit -m "chore(tools): add @bk2/tools nx plugin + @nx/plugin/@nx/devkit deps

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Scaffold the empty `app` generator and assert it runs

This task gets a runnable (no-op) generator wired up before we add template files, so the generator plumbing is proven independently of the template.

**Files:**
- Create/Modify: `tools/src/generators/app/generator.ts`, `schema.json`, `schema.d.ts`, `tools/generators.json`
- Test: `tools/src/generators/app/generator.spec.ts`

- [ ] **Step 1: Generate the generator scaffold**

Run:
```bash
pnpm nx g @nx/plugin:generator app --path=tools/src/generators/app/generator --no-interactive
```
Expected: creates `generator.ts`, `schema.json`, `schema.d.ts`, `generator.spec.ts` and adds an entry to `tools/generators.json`. (If this version uses a different `--path` convention, adjust per `pnpm nx g @nx/plugin:generator --help`.)

- [ ] **Step 2: Define the options schema**

Write `tools/src/generators/app/schema.json`:
```json
{
  "$schema": "https://json-schema.org/schema",
  "$id": "AppGenerator",
  "title": "Scaffold a new tenant app",
  "type": "object",
  "properties": {
    "tenantId": {
      "type": "string",
      "description": "Lowercase tenant id, e.g. 'acme'. Becomes apps/<tenantId>-app.",
      "pattern": "^[a-z][a-z0-9-]+$",
      "x-prompt": "Tenant id (lowercase, e.g. acme)?"
    },
    "appName": {
      "type": "string",
      "description": "Human-readable app display name, e.g. 'Acme'.",
      "x-prompt": "App display name?"
    },
    "force": {
      "type": "boolean",
      "description": "Overwrite an existing apps/<tenantId>-app directory.",
      "default": false
    }
  },
  "required": ["tenantId", "appName"]
}
```

Write `tools/src/generators/app/schema.d.ts`:
```typescript
export interface AppGeneratorSchema {
  tenantId: string;
  appName: string;
  force?: boolean;
}
```

- [ ] **Step 3: Write the failing test (validation only, no files yet)**

Write `tools/src/generators/app/generator.spec.ts`:
```typescript
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { Tree } from '@nx/devkit';
import { appGenerator } from './generator';

describe('app generator', () => {
  let tree: Tree;

  beforeEach(() => {
    tree = createTreeWithEmptyWorkspace();
  });

  it('rejects an invalid tenantId', async () => {
    await expect(
      appGenerator(tree, { tenantId: 'Acme Corp', appName: 'Acme' }),
    ).rejects.toThrow(/tenantId/);
  });

  it('creates the app project.json with the tenant name', async () => {
    await appGenerator(tree, { tenantId: 'acme', appName: 'Acme' });
    expect(tree.exists('apps/acme-app/project.json')).toBe(true);
    const projectJson = tree.read('apps/acme-app/project.json', 'utf-8') ?? '';
    expect(projectJson).toContain('"name": "acme-app"');
  });

  it('refuses to overwrite an existing app without force', async () => {
    tree.write('apps/acme-app/project.json', '{}');
    await expect(
      appGenerator(tree, { tenantId: 'acme', appName: 'Acme' }),
    ).rejects.toThrow(/already exists/);
  });
});
```

- [ ] **Step 4: Run the test, expect failure**

Run:
```bash
pnpm nx test @bk2/tools
```
Expected: FAIL — `appGenerator` does not yet validate, create files, or guard overwrite.

- [ ] **Step 5: Implement the generator body**

Write `tools/src/generators/app/generator.ts`:
```typescript
import { Tree, formatFiles, generateFiles, joinPathFragments } from '@nx/devkit';
import { AppGeneratorSchema } from './schema';

const TENANT_ID_RE = /^[a-z][a-z0-9-]+$/;

export async function appGenerator(tree: Tree, options: AppGeneratorSchema): Promise<void> {
  const { tenantId, appName, force = false } = options;

  if (!TENANT_ID_RE.test(tenantId)) {
    throw new Error(`Invalid tenantId "${tenantId}": must match ${TENANT_ID_RE}.`);
  }

  const appRoot = `apps/${tenantId}-app`;
  if (tree.exists(appRoot) && !force) {
    throw new Error(`${appRoot} already exists. Re-run with --force to overwrite.`);
  }

  generateFiles(tree, joinPathFragments(__dirname, 'files'), appRoot, {
    tenantId,
    appName,
    tmpl: '', // strips the __tmpl__ suffix from copied-verbatim files
  });

  await formatFiles(tree);
}

export default appGenerator;
```

- [ ] **Step 6: Add a placeholder template so `generateFiles` has something to emit**

Create `tools/src/generators/app/files/apps/__tenantId__-app/project.json__tmpl__`:
```json
{
  "name": "<%= tenantId %>-app",
  "$schema": "../../node_modules/nx/schemas/project-schema.json"
}
```

- [ ] **Step 7: Run the test, expect pass**

Run:
```bash
pnpm nx test @bk2/tools
```
Expected: PASS — all three specs green (validation, project.json name, overwrite guard).

- [ ] **Step 8: Verify the generators.json entry**

Read `tools/generators.json`; confirm it contains an `app` entry pointing at `./src/generators/app/generator` with `schema: "./src/generators/app/schema.json"`. If `@nx/plugin:generator` did not add it, add it manually:
```json
{
  "generators": {
    "app": {
      "factory": "./src/generators/app/generator",
      "schema": "./src/generators/app/schema.json",
      "description": "Scaffold a new CMS-minimal tenant app."
    }
  }
}
```

- [ ] **Step 9: Commit**

```bash
git add tools/
git commit -m "feat(tools): add @bk2/tools:app generator skeleton (validation + overwrite guard)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Build the CMS-minimal template tree (copy scs-app, strip, tokenize)

The template `files/apps/__tenantId__-app/` is a stripped copy of `apps/scs-app/`. This task replaces the placeholder `project.json__tmpl__` with the full app.

**Files:**
- Read-only source: `apps/scs-app/` (all)
- Create: `tools/src/generators/app/files/apps/__tenantId__-app/**`

- [ ] **Step 1: Copy the scs-app tree into the template, suffixing copied files with `__tmpl__`**

Run (copies everything except generated/secret artifacts, then renames to `__tmpl__`):
```bash
DEST=tools/src/generators/app/files/apps/__tenantId__-app
rm -rf "$DEST" && mkdir -p "$DEST"
rsync -a --exclude 'src/environments/environment.ts' \
         --exclude 'src/firebase-config.js' \
         --exclude '.env' \
         --exclude 'node_modules' \
         apps/scs-app/ "$DEST"/
# Nx treats files with the __tmpl__ suffix as templates; rename every copied file.
find "$DEST" -type f ! -name '*__tmpl__' -exec mv {} {}__tmpl__ \;
```
Expected: `$DEST` mirrors scs-app with every file ending in `__tmpl__` and no `environment.ts`/`firebase-config.js`/`.env`.

- [ ] **Step 2: Replace the routes file with the CMS-minimal route set**

Overwrite `tools/src/generators/app/files/apps/__tenantId__-app/src/app/app.routes.ts__tmpl__` with exactly:
```typescript
import { Route } from '@angular/router';
import { isAppReadyGuard, isAuthenticatedGuard, isPrivilegedGuard } from '@bk2/auth-feature';

// CMS-minimal feature routes. Navigation is activation-gated by isAppReadyGuard on the
// wrapping parent below; the <ion-router-outlet> is never removed from the DOM (gating it
// via @if crashed Ionic's StackController). Domain features are added later as building blocks.
const featureRoutes: Route[] = [
  {
    path: 'public',
    children: [
      { path: ':id/:contextMenuName', loadComponent: () => import('@bk2/cms-page-feature').then(m => m.PageDispatcher), data: { color: 'secondary' } },
      { path: ':id', loadComponent: () => import('@bk2/cms-page-feature').then(m => m.PageDispatcher), data: { color: 'secondary' } },
    ],
  },
  {
    path: 'private',
    canActivate: [isAuthenticatedGuard],
    children: [
      { path: ':id/:contextMenuName', loadComponent: () => import('@bk2/cms-page-feature').then(m => m.PageDispatcher), data: { color: 'secondary' } },
      { path: ':id', loadComponent: () => import('@bk2/cms-page-feature').then(m => m.PageDispatcher), data: { color: 'secondary' } },
    ],
  },
  {
    path: 'auth',
    children: [
      { path: '', redirectTo: 'login', pathMatch: 'full' },
      { path: 'login', loadComponent: () => import('@bk2/auth-feature').then(m => m.LoginPage) },
      { path: 'pwdreset', loadComponent: () => import('@bk2/auth-feature').then(m => m.PasswordResetPage) },
      { path: 'confirm', loadComponent: () => import('@bk2/auth-feature').then(m => m.ConfirmPasswordResetPage) },
    ],
  },
  {
    path: 'person',
    canActivate: [isAuthenticatedGuard],
    children: [
      { path: ':listId/:contextMenuName', loadComponent: () => import('@bk2/subject-person-feature').then(m => m.PersonList) },
      { path: 'profile', loadComponent: () => import('@bk2/profile-feature').then(m => m.ProfileEditPage), data: { preload: true } },
      { path: ':personKey', loadComponent: () => import('@bk2/subject-person-feature').then(m => m.PersonEditPage) },
    ],
  },
  {
    path: 'page',
    canActivate: [isAuthenticatedGuard],
    children: [
      { path: ':listId/:contextMenuName', canActivate: [isPrivilegedGuard], loadComponent: () => import('@bk2/cms-page-feature').then(m => m.PageList) },
    ],
  },
  {
    path: 'section',
    canActivate: [isAuthenticatedGuard],
    children: [
      { path: 'all', canActivate: [isPrivilegedGuard], loadComponent: () => import('@bk2/cms-section-feature').then(m => m.SectionAllList) },
    ],
  },
  {
    path: 'menu',
    canActivate: [isAuthenticatedGuard],
    children: [
      { path: 'all', canActivate: [isPrivilegedGuard], loadComponent: () => import('@bk2/cms-menu-feature').then(m => m.MenuList) },
    ],
  },
  { path: '**', loadComponent: () => import('@bk2/cms-page-feature').then(m => m.ErrorPage), data: { errorName: 'pageNotFound' } },
];

export const appRoutes: Route[] = [
  { path: '', pathMatch: 'full', redirectTo: 'public/welcome' },
  {
    // Componentless parent: applies the app-ready gate to every feature route without
    // ever removing the router outlet from the DOM.
    path: '',
    canActivateChild: [isAppReadyGuard],
    children: featureRoutes,
  },
];
```

- [ ] **Step 3: Remove the deferred chat initialization from app.config**

In `tools/src/generators/app/files/apps/__tenantId__-app/src/app/app.config.ts__tmpl__`, remove the Matrix/chat wiring (chat is a deferred building block, not part of the minimal app): delete the `@bk2/chat-feature` dynamic import and any `MatrixInitializationService` reference inside the `APP_BOOTSTRAP_LISTENER`/deferred-init block. Leave all other providers untouched.

Verify nothing else imports `@bk2/chat-feature`:
```bash
grep -rn "chat-feature" tools/src/generators/app/files/ || echo "OK: no chat-feature references remain"
```
Expected: `OK: no chat-feature references remain`.

- [ ] **Step 4: Tokenize `capacitor.config.ts`**

Overwrite `tools/src/generators/app/files/apps/__tenantId__-app/capacitor.config.ts__tmpl__` with:
```typescript
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'org.bkaiser.<%= tenantId %>',
  appName: '<%= appName %>',
  webDir: '../../dist/apps/<%= tenantId %>-app/browser'
};

export default config;
```
(If the source had additional keys, preserve them; only `appId`/`appName`/`webDir` change.)

- [ ] **Step 5: Tokenize `project.json`**

In `tools/src/generators/app/files/apps/__tenantId__-app/project.json__tmpl__`:
- Replace every literal `scs-app` with `<%= tenantId %>-app`.
- Replace the `"name"` value with `"<%= tenantId %>-app"`.
- Remove the website coupling lines that reference `scs-website` (the `assets` `input: "apps/scs-website"` glob and the `{workspaceRoot}/apps/scs-website/**/*` input) — websites are deferred and a new tenant has none.

Apply the bulk rename:
```bash
PJ=tools/src/generators/app/files/apps/__tenantId__-app/project.json__tmpl__
sed -i '' 's/scs-app/<%= tenantId %>-app/g' "$PJ"
```
Then hand-edit `$PJ` to fix the `"name"` line to `"<%= tenantId %>-app"` and delete the two `scs-website` references. Verify:
```bash
grep -n "scs" "$PJ" || echo "OK: no scs literals remain in project.json"
```
Expected: `OK: no scs literals remain in project.json` (or only `scsmemberfees`-free output — there should be none).

- [ ] **Step 6: Confirm no stray `scs` literals remain in the template**

Run:
```bash
grep -rn "scs" tools/src/generators/app/files/ | grep -v "@bk2"
```
Expected: no output (all tenant literals tokenized; `@bk2/*` import paths are tenant-agnostic and stay).

- [ ] **Step 7: Commit**

```bash
git add tools/
git commit -m "feat(tools): CMS-minimal app template derived from scs-app

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Strengthen the generator test against the real template

Now that the template is real, assert the generator emits the key files with substituted tokens.

**Files:**
- Test: `tools/src/generators/app/generator.spec.ts`

- [ ] **Step 1: Add template-aware assertions**

Append to `tools/src/generators/app/generator.spec.ts` (inside the `describe`):
```typescript
  it('substitutes tenant tokens into capacitor + project config', async () => {
    await appGenerator(tree, { tenantId: 'acme', appName: 'Acme Club' });

    const capacitor = tree.read('apps/acme-app/capacitor.config.ts', 'utf-8') ?? '';
    expect(capacitor).toContain("appId: 'org.bkaiser.acme'");
    expect(capacitor).toContain("appName: 'Acme Club'");
    expect(capacitor).not.toContain('<%=');

    const projectJson = tree.read('apps/acme-app/project.json', 'utf-8') ?? '';
    expect(projectJson).not.toContain('scs');
    expect(projectJson).not.toContain('scs-website');

    // Tenant-agnostic shell files are copied verbatim (no token leakage).
    expect(tree.exists('apps/acme-app/src/main.ts')).toBe(true);
    expect(tree.exists('apps/acme-app/src/app/app.routes.ts')).toBe(true);
    const routes = tree.read('apps/acme-app/src/app/app.routes.ts', 'utf-8') ?? '';
    expect(routes).toContain("redirectTo: 'public/welcome'");
    expect(routes).not.toContain('finance');
  });

  it('does not emit secret/generated files', async () => {
    await appGenerator(tree, { tenantId: 'acme', appName: 'Acme' });
    expect(tree.exists('apps/acme-app/.env')).toBe(false);
    expect(tree.exists('apps/acme-app/src/environments/environment.ts')).toBe(false);
    expect(tree.exists('apps/acme-app/src/firebase-config.js')).toBe(false);
  });
```

- [ ] **Step 2: Run the tests**

Run:
```bash
pnpm nx test @bk2/tools
```
Expected: PASS — token substitution, no `scs` leakage, shell files present, secrets absent.

- [ ] **Step 3: Commit**

```bash
git add tools/src/generators/app/generator.spec.ts
git commit -m "test(tools): assert app generator token substitution + template contents

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: End-to-end scaffold + build verification (throwaway tenant)

Prove a generated app actually compiles. This is the real success criterion. Uses a throwaway tenant id `gentest` that is NOT committed.

**Files:**
- Temporary: `apps/gentest-app/**` (generated, then deleted)

- [ ] **Step 1: Run the generator for real (dry-run first)**

Run:
```bash
pnpm nx g @bk2/tools:app --tenantId=gentest --appName="Gen Test" --dry-run
```
Expected: lists files it WOULD create under `apps/gentest-app/`; creates nothing on disk.

- [ ] **Step 2: Run it for real**

Run:
```bash
pnpm nx g @bk2/tools:app --tenantId=gentest --appName="Gen Test"
```
Expected: `apps/gentest-app/` created; Nx prints the file list.

- [ ] **Step 3: Generate an environment file for the throwaway app**

The build needs `environment.ts`. Reuse scs-app's `.env` purely to satisfy the generator (local, never committed):
```bash
source ./apps/scs-app/.env 2>/dev/null || source ./.env
NX_TASK_TARGET_PROJECT=gentest-app ts-node ./set-env.js
```
Expected: `apps/gentest-app/src/environments/environment.ts` written with `tenantId: 'gentest'`.

> If `set-env.js` derives the project from a different variable in practice, inspect its top (it strips `-app` from the Nx project name) and set the matching variable. Document the exact invocation in the spec's `provision-tenant` skill afterward.

- [ ] **Step 4: Build the generated app**

Run:
```bash
pnpm nx build gentest-app
```
Expected: SUCCESS. If it fails on a missing import, the failing symbol reveals a lib that the route-strip removed but the shell still references — add that route/lib back to the template (Task 3, Step 2) and re-run. Record any such fix.

- [ ] **Step 5: Tear down the throwaway app**

Run:
```bash
rm -rf apps/gentest-app
git status --porcelain apps/ | grep gentest && echo "WARNING: gentest still tracked" || echo "OK: gentest removed, nothing staged"
```
Expected: `OK: gentest removed, nothing staged`.

- [ ] **Step 6: Commit any template fixes discovered during the build**

Only if Step 4 required template changes:
```bash
git add tools/
git commit -m "fix(tools): template adjustments for clean tenant-app build

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Document the generator usage

**Files:**
- Modify: `docs/PENDING_IMPLEMENTATION.md` (advance §1.4 state for Components A/B)
- Create: `tools/README.md`

- [ ] **Step 1: Write `tools/README.md`**

```markdown
# @bk2/tools

Workspace tooling. Contains the `app` generator that scaffolds a new CMS-minimal tenant app.

## Scaffold a new tenant app

    pnpm nx g @bk2/tools:app --tenantId=acme --appName="Acme" [--force] [--dry-run]

Creates `apps/acme-app/` (bootstrap + auth + CMS page/section/menu + profile; domain
features stripped). Then generate its environment and build:

    source ./apps/acme-app/.env
    NX_TASK_TARGET_PROJECT=acme-app ts-node ./set-env.js
    pnpm nx build acme-app

The full tenant setup (Firebase Web App, AppConfig, .env, starter content) is driven by the
`provision-tenant` skill — see docs/specs/2026-06-29-tenant-provisioning-design.md.
```

- [ ] **Step 2: Advance the TOC entry**

In `docs/PENDING_IMPLEMENTATION.md` §1.4, change the Component A/B bullet from 🔴 to 🟡 with a note that the generator + template are implemented and the skill (Component C) remains open.

- [ ] **Step 3: Commit**

```bash
git add tools/README.md docs/PENDING_IMPLEMENTATION.md
git commit -m "docs(tools): document @bk2/tools:app generator; advance provisioning TOC

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-review notes

- **Spec coverage:** Component A (CMS-minimal template) = Tasks 3–5; Component B (Nx generator) = Tasks 1–2, 4. Component C (skill), Firebase, AppConfig, `.env`, seeding, website = explicitly out of scope here (spec's own out-of-scope + separate deliverable).
- **`--dry-run`:** provided natively by Nx generators (Task 5 Step 1) — no custom implementation needed.
- **Idempotency / overwrite guard:** Task 2 (test + implementation), exercised in Task 5.
- **Secrets never committed:** template excludes `.env`/`environment.ts`/`firebase-config.js` (Task 3 Step 1, asserted Task 4 Step 1); throwaway app torn down (Task 5 Step 5).
- **Open risk:** exact `@nx/plugin` generator-creation flags for 21.4.1 (Task 1 Step 2 / Task 2 Step 1) — mitigated by `--help` checks. The route-strip may miss a shell dependency — caught by the real build in Task 5 Step 4.

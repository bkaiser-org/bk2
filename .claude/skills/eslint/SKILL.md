---
name: eslint
description: Use when linting, running ESLint, or fixing lint errors in this repo — or whenever `nx lint` / `nx run-many --target=lint` crashes with "JavaScript heap out of memory". Explains why the CLI OOMs, why you must NOT raise the heap, and the per-project CLI command that actually works.
---

# ESLint (this repo)

This is a large Nx monorepo with **typed** ESLint flat configs (`@nx`, `@angular-eslint`, `@typescript-eslint`). Typed linting builds a TypeScript program for whatever tsconfig a file resolves to. Some of those programs (e.g. heavy feature libs like `shared-feature`, and the **test** tsconfigs that specs resolve to) are enormous, and more than one program in a single process exhausts the V8 heap.

## The one rule

**Prefer the editor. For CLI, lint ONE source file per invocation.** The OOM is driven by how much typed-program a single ESLint process loads — not just by project boundaries.

## What OOMs (measured, do NOT do)

| Command | Result |
|---|---|
| `pnpm nx lint <project>` | 💥 OOM — pulls the whole flat-config + a workspace TS program into one process |
| `pnpm nx run-many --target=lint ...` | 💥 OOM — every project at once, much worse |
| `npx eslint <files from 2+ projects>` | 💥 OOM — a typed program per project in one process |
| `npx eslint a.ts a.spec.ts` (even same lib) | 💥 OOM — the `.spec.ts` drags in the **test** tsconfig program on top of the lib's |
| `npx eslint <one .spec.ts>` in a heavy lib | 💥 OOM — the test program alone (AppStore + deps) blows the heap |
| `NODE_OPTIONS=--max-old-space-size=8192 ...` | ❌ Don't. Still OOMs at 8 GB, and **raising the heap is against the project's setup** — see below |

## Do NOT raise the heap

The team deliberately scopes linting instead of throwing memory at it. `.vscode/settings.json` documents this in a comment:

```jsonc
// Scope each file to its nearest project's eslint config instead of loading
// the whole monorepo (+ a workspace-wide TS program) into one server — this
// is what was causing the "JavaScript heap out of memory" crash.
"eslint.workingDirectories": [{ "mode": "auto" }],
"eslint.run": "onSave",
```

`js/ts.tsserver.maxMemory` is already set to 8192 **for the editor's TypeScript server** (inline diagnostics) — that is the only sanctioned memory bump. Do not add `NODE_OPTIONS`/`--max-old-space-size` to lint commands; if a lint OOMs, narrow the scope, don't grow the heap.

## Primary path: the editor lints

ESLint runs **in-editor on save**, scoped per file to its nearest project config (the settings above). For interactive work, trust the VSCode ESLint extension and the inline diagnostics it surfaces. You usually don't need a CLI lint at all.

## CLI fallback (when you need lint output in the terminal)

Run ESLint directly (not through `nx`), **one source file per invocation**, from the repo root:

```sh
npx eslint libs/<domain>/<layer>/src/lib/foo.store.ts        # ~3–4s, safe
```

Need several files? Loop, one process each — don't batch them:

```sh
for f in libs/cms/page/feature/src/lib/{page.store,page-list,page-edit.modal}.ts; do
  echo "== $f =="; npx eslint "$f"
done
```

To auto-fix a file: add `--fix`.

Batching a few **source** files from the *same* lib sometimes works (a single shared program), but it's not reliable — adding one `.spec.ts` or a file that resolves to a different tsconfig flips it to OOM. When in doubt, one file per call.

### Files the CLI can't lint here

`.spec.ts` in a heavy lib (and anything that resolves to a large test tsconfig program) will OOM even alone. There is no CLI workaround that respects the project's memory rules — rely on the **editor's** on-save diagnostics for those, and on `nx build` / `tsc` for the type-level guarantee. Don't grow the heap to force it.

## Type errors are not lint errors

ESLint here will not give you the authoritative type-check. For types use `nx build` (runs `tsc` via `tsconfig.lib.json`) or `npx tsc --noEmit -p libs/<domain>/<layer>/tsconfig.json` — see the [[fix-types]] skill. `nx build` is the trustworthy "does it compile" gate; lint is only for style/correctness rules.

## Verifying a change

1. Let the editor lint on save, OR run the one-file-per-call `npx eslint` fallback above over the source files you changed.
2. Type-check / "does it build" via `pnpm nx build <project>` (this is what catches type errors, since dependent libs resolve to built `.d.ts`).
3. Tests: `pnpm run test <project>`.

Never report "lint passes" based on `nx lint` succeeding — it won't run. Report it based on per-file `npx eslint` output or the editor diagnostics.

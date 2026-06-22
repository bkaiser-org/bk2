---
name: testing
description: Use when writing or running tests in this repo — Vitest unit tests for util functions and services, or Playwright end-to-end tests. Covers how to write each, how to run them, and the "@angular/compiler"/"PlatformLocation JIT" fix when a util lib starts pulling in Angular.
---

# Testing

Two test layers in this repo:

| Layer | Runner | Scope | Location |
|---|---|---|---|
| **Unit** | Vitest (jsdom) | **only** pure `util` functions and `services` | `libs/**/src/**/*.spec.ts` |
| **E2E** | Playwright | full app flows against a served `scs-app` | `e2e/*.spec.ts` |

**Do NOT write unit tests for components, stores, forms, or templates.** Unit-test only `util`/`*.util.ts` pure functions, `*.validations.ts` Vest suites, and `*.service.ts` services. Everything user-facing is covered by E2E instead.

## Running tests

```sh
# Unit — one project (preferred; project name = the nx project, e.g. location-util)
pnpm nx test <project>
pnpm nx test <project> --skip-nx-cache    # force re-run, ignore cache

# Unit — all libraries (raises heap; run before a release)
pnpm run testlibs

# E2E — Playwright (auto-serves scs-app on :4201 via playwright.config.ts)
npx playwright test                       # all e2e specs
npx playwright test e2e/smoke.spec.ts     # one file
npx playwright test --grep logout --project=chromium
npx playwright show-report                # open last HTML report
```

## Writing unit tests (Vitest)

- File sits next to the source: `foo.util.ts` → `foo.util.spec.ts`; `foo.service.ts` → `foo.service.spec.ts`.
- `globals: true` is set (from `vitest.shared.ts`) — `describe`/`it`/`expect`/`vi` are available, but existing specs import them explicitly from `vitest`; follow that.
- **Pure util function** — call it directly, assert the result. No DI.
- **Vest validation suite** — call the suite and assert `.hasErrors('field')`:
  ```ts
  expect(locationValidations(model, tenantId, '').hasErrors('address')).toBe(true);
  ```
  Note: `stringValidations` only enforces `tooLong`/`tooShort` for **mandatory** fields. For optional fields, test the `notString`/`notNull` rules (they always run), not length.
- **Service** — don't hit Firestore. Mock `inject` and collaborators with `vi.mock`, construct the service with `new`, and assert behavior. See `libs/consent/data-access/src/lib/consent.service.spec.ts` for the pattern (mock `@angular/core` `inject`, mock `@bk2/shared-util-core` helpers like `isBrowser`).

## Writing E2E tests (Playwright)

- Specs live in `e2e/`, import from `@playwright/test`, run against `baseURL` `http://localhost:4201`.
- Use Ionic-aware selectors (`ion-app`, `ion-content`, `ion-menu-button`, `ion-item`) and generous timeouts — the app is zoneless + SSR-hydration-disabled.
- Two projects: `chromium` (anonymous) and `chromium-auth` (loads `e2e/.auth-state.json` to start logged in).
- For tests needing a real login session, connect over CDP to a manually-authenticated Chrome (see header comments in `e2e/auth.spec.ts`).

## Hints

### "@angular/compiler is not available" / "PlatformLocation needs the JIT compiler"

Symptom: `pnpm nx test <util-project>` fails at **collection** (0 tests run) with:
> The injectable 'PlatformLocation' needs to be compiled using the JIT compiler, but '@angular/compiler' is not available.

Cause: the lib's import graph started pulling in an Angular dependency (often transitively via `@bk2/shared-*`), but the test project has no setup that loads the JIT compiler. It is **not** caused by the spec you just added — every spec in the project fails the same way.

Fix (one-time per project):
1. Create `libs/<domain>/<layer>/test-setup.ts`:
   ```ts
   import '@angular/compiler';
   ```
2. Reference it in that project's `vite.config.ts` under `test`:
   ```ts
   test: {
     setupFiles: ['./test-setup.ts'],
     // ...existing settings
   }
   ```
Example: `libs/forms/util/` and `libs/geo/location/util/`.

### Stale type errors after editing a shared model

After editing `shared-models` (or any lib), dependent libs resolve it through the **compiled `.d.ts` in `dist/`**, not the source. If `tsc`/tests report a field "does not exist" that you just added, rebuild the edited lib first:
```sh
pnpm nx build shared-models
```

### Type-check before/after, not instead

Tests don't replace type-checking. After editing TS, run `npx tsc --noEmit -p libs/<domain>/<layer>/tsconfig.json` (see the `fix-types` skill).

# Migration Spec: ngx-vest-forms → Angular Signal Forms

**Status:** Draft
**Scope:** All existing Vest-backed forms in the application
**Approach:** Hand-rolled `validateTree()` bridge (no `@ngx-signal-forms/toolkit`)
**Target:** Angular 21+ Signal Forms (`@angular/forms/signals`)

-----

## 1. Goal

Migrate every form currently built with **ngx-vest-forms** (template-driven forms + Vest suites) to **Angular Signal Forms**, while **reusing the existing Vest validation suites unchanged**. Validation logic must remain the single source of truth in Vest; only the binding layer between Vest and Angular changes.

### Non-goals

- Rewriting or replacing Vest suites with Angular’s built-in validators or Zod.
- Adopting `@ngx-signal-forms/toolkit` (`validateVest()`). We build and own a small bridge instead, to avoid a third-party dependency that tracks an unstable API.
- Changing validation *rules*, error copy, or business logic during the migration. This is a structural migration; behavior must be preserved.

-----

## 2. Background

### What we have today (per form)

- A `staticSuite` from `vest` defining `test()` / `enforce()` rules, with `only(field)` for field-scoped runs.
- A template-driven form using the ngx-vest-forms directives: `ngxVestForm` (formerly `scVestForm`) on the `<form>`, `[ngModel]` / `ngModelGroup`, and `sc-control-wrapper` / `ngx-control-wrapper` for error display.
- A `formValue` signal fed by the `formValueChange` output.
- Often a `validationConfig` describing cross-field re-validation, and frequently **async** suites.

### What we move to

- A writable `model` signal as the single source of truth.
- `form(model, schema)` returning a `FieldTree`.
- The `[field]` directive binding inputs to fields.
- Errors read from `field.errors()`, state from `field.touched()` / `field.invalid()`.
- Validation wired in the schema callback via our **Vest bridge** built on `validateTree()`.
- Submission via `submit()`.

### Why the suites survive untouched

A Vest `result.getErrors()` returns `Record<string, string[]>` — field key to messages. The bridge’s only job is to translate that map into Signal Forms’ `ValidationError` array. No rule logic is touched.

-----

## 3. Constraints & principles

1. **Suites are immutable during migration.** Do not edit a `.suite.ts` file as part of moving a form. If a suite needs a change, that is a separate, reviewed task.
1. **One shared bridge.** A single `vest-bridge.ts` utility is reused by every form. No per-form copies of the translation loop.
1. **Behavior parity is the acceptance bar.** Each migrated form must produce the same errors, on the same fields, at the same times as before.
1. **Incremental & reversible.** Forms migrate one at a time behind the existing route/component boundary. Reactive/template forms and Signal Forms can coexist in the app during rollout.
1. **`only()` stays unconditional.** Per Vest’s requirement, suites must call `only(field)` unconditionally. The bridge respects this; do not introduce conditional `only()`.

-----

## 4. The shared bridge utility

Create `src/app/forms/vest-bridge.ts`. This is the **only** new validation infrastructure.

```ts
import { validateTree, ValidationError } from '@angular/forms/signals';
import type { StaticSuite } from 'vest';

/**
 * Resolve a Vest field key (e.g. "email" or "generalInfo.firstName"
 * or "items[0].name") to a Signal Forms field reference on the FieldTree.
 */
function resolveFieldRef(root: any, key: string): unknown {
  if (!key) return root;
  return key
    .replace(/\[(\d+)\]/g, '.$1') // items[0] -> items.0
    .split('.')
    .reduce((node, segment) => (node == null ? node : node[segment]), root);
}

/**
 * Synchronous Vest suite -> Signal Forms bridge.
 * Runs the ENTIRE suite on every tree change and maps each error
 * onto its owning field. Use validateVestField (below) when a suite
 * is large and per-field scoping matters.
 */
export function validateVestTree<T>(
  path: any,
  suite: StaticSuite<(model: T, field?: string) => void>,
) {
  validateTree(path, (ctx) => {
    const result = suite(ctx.value() as T);
    const fieldErrors = result.getErrors(); // Record<string, string[]>
    const errors: ValidationError.WithOptionalField[] = [];

    for (const [key, messages] of Object.entries(fieldErrors)) {
      const field = resolveFieldRef(ctx.field, key);
      if (!field) continue; // skip keys with no matching field
      errors.push(
        ...messages.map((message) => ({
          kind: `vest.${key}`,
          message,
          field: field as any,
        })),
      );
    }

    return errors.length ? errors : undefined;
  });
}
```

### Usage in a component

```ts
import { signal } from '@angular/core';
import { form } from '@angular/forms/signals';
import { validateVestTree } from '../forms/vest-bridge';
import { signupSuite } from './signup.suite'; // UNCHANGED

protected model = signal<SignupModel>({ username: '', email: '' });
protected readonly form = form(this.model, (path) =>
  validateVestTree(path, signupSuite),
);
```

> **Verify per Angular version:** the exact import surface of `@angular/forms/signals`
> (`validateTree`, `ValidationError.WithOptionalField`) and the `FieldTree` indexing
> used by `resolveFieldRef` may shift while Signal Forms stabilizes. Pin the Angular
> version and confirm against the installed typings before bulk migration.

-----

## 5. Handling the harder cases

### 5.1 Per-field scoping (large suites)

`validateVestTree` re-runs the whole suite on every change. For large suites where Vest’s `only(field)` scoping matters for performance, scope per field instead:

```ts
import { validate, ValidationError } from '@angular/forms/signals';

export function validateVestField<T>(
  fieldPath: any,
  suite: StaticSuite<(model: T, field?: string) => void>,
  fieldName: string,
  rootValue: () => T,
) {
  validate(fieldPath, (ctx) => {
    const result = suite(rootValue(), fieldName); // only(fieldName) runs
    const messages = result.getErrors(fieldName);
    return messages.length
      ? messages.map((message) => ({ kind: `vest.${fieldName}`, message }))
      : undefined;
  });
}
```

Decision rule: default to `validateVestTree`. Switch a form to `validateVestField`
only if profiling shows the full-suite run is a measurable cost.

### 5.2 Async suites (common in ngx-vest-forms)

ngx-vest-forms suites are frequently asynchronous (e.g. server uniqueness checks).
`validateTree` is **synchronous** and cannot host them. Async suites must use Signal
Forms’ async validation primitive instead of the bridge above.

Approach:

- Await the Vest run’s completion (`new Promise(resolve => suite(model).done(resolve))`)
  and map `getErrors()` inside the async validator factory.
- Treat async validation as a separate, explicitly-flagged migration step per form.

> **Verify per Angular version:** confirm the exact async validation API
> (factory/params/resource signature) in your installed Signal Forms build before
> implementing. Do not assume the sync `validateTree` shape carries over. Capture the
> agreed async helper in `vest-bridge.ts` once verified, as `validateVestTreeAsync`.

### 5.3 Cross-field validation

Cross-field rules already live inside the Vest suite (e.g. `confirmPassword` matching
`password`). Because `validateVestTree` runs the whole suite against the full model on
every change, cross-field rules work with no extra wiring. The old `validationConfig`
re-validation map is **no longer needed** — delete it during migration.

### 5.4 Nested groups & form arrays

- `ngModelGroup` structures become nested objects in the `model` signal.
- Vest keys for nested fields are dot-paths (`generalInfo.firstName`); `resolveFieldRef`
  walks them.
- Form arrays: model holds an array; Vest keys use indices (`items.0.name` or
  `items[0].name`). Confirm array indexing on the `FieldTree` for your version.

### 5.5 Vest warnings (`warn()`)

Signal Forms errors are blocking. If a suite uses `warn()` for advisory (non-blocking)
guidance, those must **not** be pushed as `ValidationError`s. Surface warnings through a
separate computed signal reading `result.getWarnings()`, rendered as advisory UI. Flag
any form using `warn()` so it is not silently downgraded to blocking errors.

-----

## 6. Template migration

|ngx-vest-forms (template-driven)                            |Signal Forms                                              |
|------------------------------------------------------------|----------------------------------------------------------|
|`<form ngxVestForm [suite]="suite" (formValueChange)="...">`|`<form (ngSubmit)="onSubmit($event)" novalidate>`         |
|`[ngModel]="formValue().email"` + `name="email"`            |`[field]="form.email"`                                    |
|`ngModelGroup="generalInfo"`                                |bind nested fields: `[field]="form.generalInfo.firstName"`|
|`sc-control-wrapper` / `ngx-control-wrapper`                |read `field().errors()` directly (see below)              |
|`formValueChange` → feed signal                             |model **is** the signal; two-way via `[field]`            |

Error display pattern:

```html
@let email = form.email();
@if (email.touched() && email.invalid()) {
  <ul class="error-list">
    @for (err of email.errors(); track $index) {
      <li>{{ err.message }}</li>
    }
  </ul>
}
```

-----

## 7. Form state CSS classes

Signal Forms does **not** emit the `ng-touched` / `ng-dirty` / `ng-invalid` / `ng-pending`
classes automatically. Any styling that relies on them breaks on migration. Re-enable
them globally via `provideSignalFormsConfig` with `NG_STATUS_CLASSES` (Angular 21.0.1+)
rather than per-form. Add this to the migration checklist so styling regressions are
caught early.

-----

## 8. Submission

Replace manual validity checks with `submit()`, which only runs the callback when the
form is valid:

```ts
import { submit } from '@angular/forms/signals';

protected onSubmit(event: Event): void {
  event.preventDefault();
  submit(this.form, async () => {
    await this.api.save(this.model());
  });
}
```

Server-side validation errors returned from `save()` should be mapped back onto fields
using the same `{ kind, message, field }` shape used by the bridge.

-----

## 9. Per-form migration recipe

For each form, in order:

1. **Inventory.** Note: suite path, sync vs async, `validationConfig` presence, nested
   groups/arrays, `warn()` usage, and any custom `sc-control-wrapper` styling.
1. **Model.** Replace `formValue` signal + `formValueChange` with a `model` signal typed
   to the form shape (drop `NgxDeepPartial`; type the real model).
1. **Wire validation.** `form(model, path => validateVestTree(path, theSuite))`.
   Suite import is unchanged. Use `validateVestField` only if §5.1 applies; use the async
   helper if §5.2 applies.
1. **Template.** Swap directives per §6; replace error wrappers with `field().errors()`.
1. **Delete dead wiring.** Remove `validationConfig`, `formValueChange` handlers, and
   ngx-vest-forms imports for this component.
1. **State classes.** Confirm §7 is in place if the component relied on `ng-*` classes.
1. **Submit.** Migrate to `submit()` per §8.
1. **Test.** Run the parity tests in §10.
1. **Remove dependency** (final form only): once no component imports ngx-vest-forms,
   drop it from `package.json`. `vest` itself stays.

-----

## 10. Testing strategy

- **Suite tests are reused as-is.** Vest suites are independently unit-tested; those
  tests do not change and must stay green.
- **Per-form parity tests.** For each migrated form, assert that for a fixed set of model
  inputs the set of `{ field, messages }` matches pre-migration output. Capture the
  pre-migration error map as a fixture before touching the component.
- **Interaction tests.** touched/blur behavior, error appearance/disappearance, submit
  blocked while invalid, submit fires when valid.
- **Async forms.** Add explicit pending-state and resolution tests.
- **Visual/state classes.** Snapshot or assert presence of `ng-touched` / `ng-invalid`
  where styling depends on them.

-----

## 11. Rollout & phasing

1. **Phase 0 — Infrastructure.** Land `vest-bridge.ts`, the async helper (once §5.2 is
   verified), and global `NG_STATUS_CLASSES` config. No forms migrated yet.
1. **Phase 1 — Pilot.** Migrate 1–2 simple, **synchronous** forms end-to-end. Validate
   the recipe and parity-test approach. Adjust the bridge if needed.
1. **Phase 2 — Bulk sync forms.** Migrate remaining synchronous forms in batches by
   feature area.
1. **Phase 3 — Async & complex.** Migrate async suites, form arrays, and `warn()` forms.
1. **Phase 4 — Cleanup.** Remove ngx-vest-forms dependency and any leftover
   `validationConfig` / wrapper components.

Forms not yet migrated continue to work unchanged; the two systems coexist per component.

-----

## 12. Risks & open questions

- **API instability.** Signal Forms is new and iterating; `validateTree` /
  `ValidationError` / `FieldTree` shapes may change. *Mitigation:* pin Angular, centralize
  all coupling in `vest-bridge.ts`, verify against installed typings before each phase.
- **Async API unconfirmed.** §5.2 must be validated against the installed version before
  Phase 3. *Owner: TBD.*
- **FieldTree array indexing.** `resolveFieldRef` array handling (§5.4) needs confirmation
  for form-array forms. *Owner: TBD.*
- **Silent warning downgrade.** Forms using `warn()` must be flagged so advisory messages
  aren’t turned into blocking errors. *Owner: TBD.*
- **Performance.** Whole-suite runs on every change (§5.1) — profile large forms; fall
  back to per-field scoping if needed.

-----

## 13. Definition of done (per form)

- [ ] Suite file unchanged; suite unit tests green.
- [ ] Component uses `model` signal + `form(model, validateVestTree(...))`.
- [ ] Template uses `[field]` and `field().errors()`; old directives removed.
- [ ] `validationConfig` and `formValueChange` wiring deleted.
- [ ] State classes restored where styling depends on them.
- [ ] Submission via `submit()`; server errors mapped to fields.
- [ ] Parity tests pass against pre-migration error fixtures.
- [ ] Async/array/warn cases handled or explicitly N/A.

## Definition of done (project)

- [ ] All forms migrated and parity-tested.
- [ ] `ngx-vest-forms` removed from `package.json`; `vest` retained.
- [ ] Bridge utilities documented in the repo README.
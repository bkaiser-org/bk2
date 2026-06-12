# Vest → Angular Signal Forms: Bulk Migration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate all remaining ngx-vest-forms usages to Angular Signal Forms, reusing all Vest suites unchanged, one domain batch at a time.

**Architecture:** The `validateVestTree` bridge in `@bk2/shared-util-angular` is the sole integration point between Vest suites and Angular Signal Forms. Each form adds `form(this.formData, (path) => validateVestTree(path, suite))` and replaces `scVestForm` directive + `[suite]` binding with a plain `<form novalidate>`. The `valid` output is emitted reactively via an `effect`. Forms that display per-field errors retain their `validationResult` computed signal for error display.

**Tech Stack:** Angular 21.2.9 `@angular/forms/signals` (`form`, `validateTree`, `FieldTree`), Vest `staticSuite`, `@bk2/shared-util-angular` (`validateVestTree`).

---

## Status at Plan Start

**Done (do NOT redo):**
- `libs/shared/util-angular/src/lib/vest-bridge.ts` — bridge utility ✅
- `libs/shared/util-angular/src/index.ts` — exports `validateVestTree` ✅
- `libs/geo/trip/ui/src/lib/trip-edit.form.ts` — pilot migration ✅
- No `NG_STATUS_CLASSES` needed — project has zero `ng-*` CSS class styling ✅

**Remaining:** 35 form files + 3 trivial removals + 17 shared/ui cleanup files

---

## API Quick Reference (Angular 21.2.9)

| What | How |
|------|-----|
| Create Signal Form | `form(this.formData, (path) => validateVestTree(path, suite))` |
| Read form validity | `this.fooForm().valid()` |
| Emit validity reactively | `effect(() => this.valid.emit(this.fooForm().valid()))` |
| Bridge import | `import { validateVestTree } from '@bk2/shared-util-angular'` |
| Form create import | `import { form } from '@angular/forms/signals'` |
| Multi-arg suites | Pass with `as any`: `validateVestTree(path, myMultiArgSuite as any)` |

---

## Standard Per-Form Recipe

Every form migration follows this recipe. Deviations are noted per task.

### Template change

**Before:**
```html
<form scVestForm
  [formValue]="formData()"
  [suite]="suite"
  (dirtyChange)="dirty.emit($event)"
  (validChange)="valid.emit($event)"
  (formValueChange)="onFormChange($event)">
```

**After:**
```html
<form novalidate>
```

### Class changes

**Remove:**
```ts
import { vestForms } from 'ngx-vest-forms';
// in imports array:
vestForms,
// in class:
protected readonly suite = fooValidations;
protected onFormChange(value: FooModel): void { this.formData.update(vm => ({...vm, ...value})); }
```

**Add:**
```ts
import { form } from '@angular/forms/signals';
import { validateVestTree } from '@bk2/shared-util-angular';
// in class:
protected readonly fooForm = form(this.formData, (path) => validateVestTree(path, fooValidations as any));
constructor() {
  effect(() => this.valid.emit(this.fooForm().valid()));
}
```

**`dirty` tracking:** The `dirty.emit(true)` call stays inside `onFieldChange`. The `(dirtyChange)` binding from `scVestForm` is removed; nothing replaces it (dirty state comes from field mutations).

**`validationResult` computed (forms with `<bk-error-note>`):** Keep unchanged for per-field error display. It does NOT need to change:
```ts
// Keep as-is:
private readonly validationResult = computed(() => fooValidations(this.formData(), this.tenants(), this.allTags()));
protected nameErrors = computed(() => this.validationResult().getErrors('name'));
```

**Multi-arg suites** (`(model, tenants, tags, field?)`):** The bridge calls `suite(model)` — extra args are undefined, matching current ngx-vest-forms behavior. The `as any` cast bypasses TypeScript's strict suite-type check. If the form has a `validationResult` computed that passes extra args, that computed provides correct per-field error display separately.

### Package changes per lib

For each lib that doesn't yet have `@bk2/shared-util-angular`:

1. **package.json** — add to dependencies:
   ```json
   "@bk2/shared-util-angular": "*"
   ```
2. **tsconfig.json** — add to references (adjust relative path):
   ```json
   { "path": "../../shared/util-angular/tsconfig.lib.json" }
   ```

---

## File Map

| File | Action | Suite |
|------|--------|-------|
| `libs/shared/util-angular/src/lib/vest-bridge.ts` | No change needed | — |
| `libs/chat/ui/src/lib/room-edit.form.ts` | Migrate | `roomValidations` |
| `libs/auth/ui/src/lib/login.form.ts` | Migrate (special: dynamic suite) | `loginValidations` / `emailValidations` / `passwordValidations` |
| `libs/folder/ui/src/lib/folder.form.ts` | Migrate + input→model | `folderValidations` |
| `libs/category/ui/src/lib/category.form.ts` | Migrate (keep validationResult) | `categoryListValidations` |
| `libs/subject/address/ui/src/lib/address.form.ts` | Migrate | `addressValidations` |
| `libs/subject/group/ui/src/lib/group.form.ts` | Migrate | `groupValidations` |
| `libs/subject/org/ui/src/lib/org.form.ts` | Migrate | `orgValidations` |
| `libs/subject/org/ui/src/lib/org-new.form.ts` | Migrate | `orgNewFormValidations` |
| `libs/subject/person/ui/src/lib/person.form.ts` | Migrate | `personValidations` |
| `libs/subject/person/ui/src/lib/person-new.form.ts` | Migrate | `personNewFormValidations` |
| `libs/subject/application/ui/src/lib/application.form.ts` | Remove vestForms only | none |
| `libs/relationship/invitation/ui/src/lib/invitation.form.ts` | Migrate | `invitationValidations` |
| `libs/relationship/membership/ui/src/lib/membership.form.ts` | Migrate | `membershipValidations` |
| `libs/relationship/membership/ui/src/lib/member-new.form.ts` | Migrate | `memberNewFormValidations` |
| `libs/relationship/membership/ui/src/lib/category-change.form.ts` | Migrate | `categoryChangeFormValidations` |
| `libs/relationship/membership/ui/src/lib/scs-member-fee-edit.form.ts` | Migrate (optional formData) | `scsMemberFeeValidations` |
| `libs/relationship/ownership/ui/src/lib/ownership-form.ts` | Migrate | `ownershipValidations` |
| `libs/relationship/ownership/feature/src/lib/ownership-new.form.ts` | Migrate | `ownershipValidations` |
| `libs/relationship/personal-rel/ui/src/lib/personal-rel.form.ts` | Migrate | `personalRelValidations` |
| `libs/relationship/reservation/ui/src/lib/reservation.form.ts` | Migrate | `reservationValidations` |
| `libs/relationship/reservation/ui/src/lib/reservation-apply.form.ts` | Migrate | `reservationApplyValidations` |
| `libs/relationship/responsibility/ui/src/lib/responsibility.form.ts` | Migrate | `responsibilityValidations` |
| `libs/relationship/transfer/ui/src/lib/transfer.form.ts` | Migrate | `transferValidations` |
| `libs/relationship/workrel/ui/src/lib/workrel.form.ts` | Migrate | `workrelValidations` |
| `libs/resource/ui/src/lib/resource.form.ts` | Migrate | `resourceValidations` |
| `libs/task/ui/src/lib/task.form.ts` | Migrate | `taskValidations` |
| `libs/geo/location/ui/src/lib/location.form.ts` | Migrate | `locationValidations` |
| `libs/calevent/ui/src/lib/calevent.form.ts` | Migrate | `calEventValidations` |
| `libs/document/ui/src/lib/document.form.ts` | Migrate | `documentValidations` |
| `libs/cms/page/ui/src/lib/page.form.ts` | Migrate | `pageValidations` |
| `libs/cms/menu/ui/src/lib/menu.form.ts` | Migrate | `menuItemValidations` |
| `libs/cms/icon/ui/src/lib/icon-edit.form.ts` | Migrate | `iconValidations` |
| `libs/cms/section/ui/src/lib/album-configuration.ts` | Remove vestForms only | none |
| `libs/cms/section/ui/src/lib/people-configuration.ts` | Remove vestForms only | none |
| `libs/user/ui/src/lib/fbuser.form.ts` | Migrate | `firebaseUserFormValidations` |
| `libs/user/ui/src/lib/user-auth.form.ts` | Migrate | `userAuthFormValidations` |
| `libs/user/ui/src/lib/user-display.form.ts` | Migrate | `userDisplayFormValidations` |
| `libs/user/ui/src/lib/user-model.form.ts` | Migrate | `userModelFormValidations` |
| `libs/user/ui/src/lib/user-notification.form.ts` | Migrate | `userNotificationFormValidations` |
| `libs/user/ui/src/lib/user-privacy.form.ts` | Migrate | `userPrivacyFormValidations` |
| `libs/profile/ui/src/lib/profile-data.form.ts` | Migrate | `personValidations` |
| `libs/profile/ui/src/lib/profile-privacy.form.ts` | Migrate | `userValidations` |
| `libs/profile/ui/src/lib/profile-settings.form.ts` | Migrate | `userValidations` |
| `libs/finance/account/ui/src/lib/account.form.ts` | Migrate | `accountValidations` |
| `libs/finance/expense/ui/src/lib/expense.form.ts` | Migrate | `expenseValidations` |
| `libs/finance/invoice/ui/src/lib/invoice-edit.form.ts` | Migrate + input→model | `invoiceValidations` |
| `libs/finance/invoice/ui/src/lib/bexio-invoice-new.form.ts` | Migrate + input→model | `bexioInvoiceValidations` |
| 17× `libs/shared/ui/src/lib/*.ts` | Phase 4: remove vestFormsViewProviders | — |

---

## Task 1: Migrate chat/room-edit.form.ts (simple suite, already has shared-util-angular)

`room-edit.form.ts` uses `roomValidations` which is a simple `(model, field?)` suite. `chat-ui` already has `@bk2/shared-util-angular` in package.json and tsconfig.json.

**Files:**
- Modify: `libs/chat/ui/src/lib/room-edit.form.ts`

- [ ] **Step 1: Read the file**

```bash
cat libs/chat/ui/src/lib/room-edit.form.ts
```

- [ ] **Step 2: Apply the standard recipe**

In `room-edit.form.ts`:
1. Replace `import { vestForms } from 'ngx-vest-forms';` with:
   ```ts
   import { form } from '@angular/forms/signals';
   import { validateVestTree } from '@bk2/shared-util-angular';
   ```
2. Remove `vestForms` from the `imports` array in `@Component`.
3. Remove `FormsModule` from the `imports` array (it was only needed for ngModel wiring via vestForms).
4. Remove `protected readonly suite = roomValidations;`
5. Remove the `onFormChange` method (the one that forwards form value changes).
6. Add to class:
   ```ts
   protected readonly roomForm = form(this.formData, (path) =>
     validateVestTree(path, roomValidations),
   );
   constructor() {
     effect(() => this.valid.emit(this.roomForm().valid()));
   }
   ```
   Add `effect` to the `@angular/core` import.
7. In the template: replace:
   ```html
   <form scVestForm
     [formValue]="formData()"
     [suite]="suite"
     (dirtyChange)="dirty.emit($event)"
     (validChange)="valid.emit($event)"
     (formValueChange)="onFormChange($event)">
   ```
   with:
   ```html
   <form novalidate>
   ```

- [ ] **Step 3: Type-check chat-ui**

```bash
npx tsc --noEmit -p libs/chat/ui/tsconfig.json
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add libs/chat/ui/src/lib/room-edit.form.ts
git commit -m "feat(chat-ui): migrate room-edit.form to Angular Signal Forms"
```

---

## Task 2: Migrate auth/login.form.ts (dynamic suite selection)

`login.form.ts` selects between three suites based on a `context` input (`login` | `email` | `password`). All three suites have simple `(model, field?)` signatures. Since `form()` is created once with a fixed schema, the simplest migration is to always run `authCredentialsValidations` (the broadest suite) and rely on the context-specific inputs to be empty when their context is inactive. If that's not acceptable, create a computed that re-creates the form — but start with the simple approach.

**Files:**
- Modify: `libs/auth/ui/src/lib/login.form.ts`

- [ ] **Step 1: Read the file**

```bash
cat libs/auth/ui/src/lib/login.form.ts
```

- [ ] **Step 2: Check auth-util package.json**

```bash
cat libs/auth/ui/package.json
```

If `@bk2/shared-util-angular` is missing, add it to `dependencies` and add the tsconfig reference:
```json
// package.json dependencies:
"@bk2/shared-util-angular": "*"
// tsconfig.json references (adjust path depth):
{ "path": "../../shared/util-angular/tsconfig.lib.json" }
```

- [ ] **Step 3: Apply migration**

In `login.form.ts`:
1. Replace `import { vestForms } from 'ngx-vest-forms';` with:
   ```ts
   import { form } from '@angular/forms/signals';
   import { validateVestTree } from '@bk2/shared-util-angular';
   ```
2. Remove `vestForms, FormsModule` from `imports` array.
3. Remove the `get suite()` getter.
4. Remove `onFormChange`. The valid output was emitted inside it — move that to an `effect`.
5. Remove the manual `emailErrors` and `passwordErrors` signals (if they were only populated from `onFormChange`). They can be recomputed from `authCredentialsValidations` directly if still needed for `<bk-error-note>`.

   If error notes are displayed and need to stay, keep:
   ```ts
   private readonly validationResult = computed(() =>
     authCredentialsValidations(this.vm(), undefined, this.context()),
   );
   protected emailErrors = computed(() => this.validationResult().getErrors('loginEmail'));
   protected passwordErrors = computed(() => this.validationResult().getErrors('loginPassword'));
   ```

6. Add to class:
   ```ts
   protected readonly loginForm = form(this.vm, (path) =>
     validateVestTree(path, loginValidations),
   );
   constructor() {
     effect(() => this.validChange.emit(this.loginForm().valid()));
   }
   ```
   `loginValidations` validates all fields (email + password). When `context = 'email'`, the password field will be empty and its validation may or may not fire — inspect the suite to confirm. If the full-suite approach doesn't match behavior, use:
   ```ts
   protected readonly loginForm = form(this.vm, (path) => {
     const suite = this.context() === 'email' ? emailValidations
                 : this.context() === 'password' ? passwordValidations
                 : loginValidations;
     validateVestTree(path, suite);
   });
   ```
   Note: the schema callback runs once; `this.context()` is read at creation time. If you need reactive suite switching, use a computed or recreate the form on context change (advanced — start with the simpler approach).

7. Template: replace `<form scVestForm ...>` with `<form novalidate>`.

- [ ] **Step 4: Type-check auth-ui**

```bash
npx tsc --noEmit -p libs/auth/ui/tsconfig.json
```

- [ ] **Step 5: Commit**

```bash
git add libs/auth/ui/src/lib/login.form.ts libs/auth/ui/package.json libs/auth/ui/tsconfig.json
git commit -m "feat(auth-ui): migrate login.form to Angular Signal Forms"
```

---

## Task 3: Migrate folder/folder.form.ts (input→model conversion)

`folder.form.ts` currently uses `input.required<FolderModel>()` + `formDataChange output` instead of `model.required<FolderModel>()`. For Signal Forms, `form()` requires a `WritableSignal`. `model.required()` provides that AND automatically creates the two-way binding pair (`[formData]` + `(formDataChange)`), so callers don't change.

`folderValidations` has signature `(model, tenants, tags, field?)`. The bridge calls it with model only — this matches current ngx-vest-forms behavior.

**Files:**
- Modify: `libs/folder/ui/src/lib/folder.form.ts`
- Modify: `libs/folder/ui/package.json`
- Modify: `libs/folder/ui/tsconfig.json`

- [ ] **Step 1: Read files**

```bash
cat libs/folder/ui/src/lib/folder.form.ts
cat libs/folder/ui/package.json
cat libs/folder/ui/tsconfig.json
```

- [ ] **Step 2: Update package.json and tsconfig.json**

Add to `libs/folder/ui/package.json` dependencies:
```json
"@bk2/shared-util-angular": "*",
"@angular/forms": "*"
```

Add to `libs/folder/ui/tsconfig.json` references (adjust relative path from `libs/folder/ui/`):
```json
{ "path": "../../shared/util-angular/tsconfig.lib.json" }
```

- [ ] **Step 3: Apply migration to folder.form.ts**

```ts
// REMOVE:
import { vestForms } from 'ngx-vest-forms';
import { FormsModule } from '@angular/forms';

// ADD:
import { effect } from '@angular/core';  // add effect to existing @angular/core import
import { form } from '@angular/forms/signals';
import { validateVestTree } from '@bk2/shared-util-angular';
```

In `@Component` imports array:
- Remove `vestForms, FormsModule`

In class:
- Change `public readonly formData = input.required<FolderModel>();` → `public formData = model.required<FolderModel>();`
- Remove `public readonly formDataChange = output<FolderModel>();`
- Remove `protected readonly suite = folderValidations;`
- Remove `onFormChange(formData: FolderModel)` method

Add to class:
```ts
protected readonly folderForm = form(this.formData, (path) =>
  validateVestTree(path, folderValidations as any),
);
constructor() {
  effect(() => this.valid.emit(this.folderForm().valid()));
}
```

Update `onFieldChange` to write to the model signal directly (instead of emitting `formDataChange`):
```ts
protected onFieldChange(fieldName: string, fieldValue: string | string[]): void {
  this.dirty.emit(true);
  this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
}
```

Template: replace `<form scVestForm [formValue]="formData()" [suite]="suite" (dirtyChange)="..." (validChange)="..." (formValueChange)="...">` with `<form novalidate>`.

- [ ] **Step 4: Verify callers still work**

```bash
grep -r "formDataChange\|formData.*folder\|FolderForm" libs apps --include="*.ts" --include="*.html" -l
```

Check that callers use `[formData]` and `(formDataChange)` or `[(formData)]`. Since `model.required()` generates both, they all still work.

- [ ] **Step 5: Type-check folder-ui**

```bash
npx tsc --noEmit -p libs/folder/ui/tsconfig.json
```

- [ ] **Step 6: Commit**

```bash
git add libs/folder/ui/src/lib/folder.form.ts libs/folder/ui/package.json libs/folder/ui/tsconfig.json
git commit -m "feat(folder-ui): migrate folder.form to Angular Signal Forms"
```

---

## Task 4: Migrate category/category.form.ts (preserving validationResult for error display)

`categoryListValidations` has signature `(model, tenants, tags, field?)`. The form has `tenants = input.required<string>()` and `allTags = input.required<string>()`. The `validationResult` computed passes all args — keep it for per-field error display. The bridge calls `suite(model)` only (matching existing ngx-vest-forms behavior for live validity).

**Files:**
- Modify: `libs/category/ui/src/lib/category.form.ts`
- Modify: `libs/category/ui/package.json`
- Modify: `libs/category/ui/tsconfig.json`

- [ ] **Step 1: Read files**

```bash
cat libs/category/ui/src/lib/category.form.ts
cat libs/category/ui/package.json
cat libs/category/ui/tsconfig.json
```

- [ ] **Step 2: Update package.json and tsconfig.json**

Add to `libs/category/ui/package.json` dependencies:
```json
"@bk2/shared-util-angular": "*",
"@angular/forms": "*"
```

Add to `libs/category/ui/tsconfig.json` references:
```json
{ "path": "../../shared/util-angular/tsconfig.lib.json" }
```

- [ ] **Step 3: Apply migration to category.form.ts**

```ts
// REMOVE import:
import { vestForms } from 'ngx-vest-forms';

// ADD to existing @angular/core import:
effect,

// ADD imports:
import { form } from '@angular/forms/signals';
import { validateVestTree } from '@bk2/shared-util-angular';
```

In `@Component` imports array:
- Remove `vestForms`

In class:
- Remove `protected readonly suite = categoryListValidations;`
- Remove `onFormChange` method

Add to class:
```ts
protected readonly categoryForm = form(this.formData, (path) =>
  validateVestTree(path, categoryListValidations as any),
);
constructor() {
  effect(() => this.valid.emit(this.categoryForm().valid()));
}
```

**Keep unchanged** (these preserve per-field error display):
```ts
private readonly validationResult = computed(() => categoryListValidations(this.formData(), this.tenants(), this.allTags()));
protected nameErrors = computed(() => this.validationResult().getErrors('name'));
protected i18nBaseErrors = computed(() => this.validationResult().getErrors('i18nBase'));
```

Template: replace `<form scVestForm [formValue]="formData()" [suite]="suite" (dirtyChange)="..." (validChange)="..." (formValueChange)="...">` with `<form novalidate>`.

- [ ] **Step 4: Type-check category-ui**

```bash
npx tsc --noEmit -p libs/category/ui/tsconfig.json
```

- [ ] **Step 5: Commit**

```bash
git add libs/category/ui/src/lib/category.form.ts libs/category/ui/package.json libs/category/ui/tsconfig.json
git commit -m "feat(category-ui): migrate category.form to Angular Signal Forms"
```

---

## Task 5: Migrate subject domain forms

Apply the **standard recipe** to each form in this batch. All use `model.required<T>()`. Run type-checks after each form, commit per form or per-domain.

**Forms and suites:**

| File | Suite | Import from | Extra args? | Has validationResult? |
|------|-------|-------------|-------------|----------------------|
| `libs/subject/address/ui/src/lib/address.form.ts` | `addressValidations` | `@bk2/subject-address-util` | Yes (tenants, tags) | Check file |
| `libs/subject/group/ui/src/lib/group.form.ts` | `groupValidations` | `@bk2/subject-group-util` | Yes | Check file |
| `libs/subject/org/ui/src/lib/org.form.ts` | `orgValidations` | `@bk2/subject-org-util` | Yes | Check file |
| `libs/subject/org/ui/src/lib/org-new.form.ts` | `orgNewFormValidations` | `@bk2/subject-org-util` | Check suite | Check file |
| `libs/subject/person/ui/src/lib/person.form.ts` | `personValidations` | `@bk2/subject-person-util` | Yes | Check file |
| `libs/subject/person/ui/src/lib/person-new.form.ts` | `personNewFormValidations` | `@bk2/subject-person-util` | Check suite | Check file |

**Package changes (per UI lib, if not already present):**
- `libs/subject/address/ui/package.json` → add `"@bk2/shared-util-angular": "*"`, `"@angular/forms": "*"`
- `libs/subject/address/ui/tsconfig.json` → add `{ "path": "../../shared/util-angular/tsconfig.lib.json" }`
- Repeat for `group/ui`, `org/ui`, `person/ui` (check each first with `cat package.json`).

**Per-form steps:**

- [ ] **Step 1: For each form — read, apply recipe, type-check**

```bash
# Read form to understand its current structure
cat libs/subject/address/ui/src/lib/address.form.ts

# Apply recipe:
# 1. Remove vestForms import + from imports[]
# 2. Add form, effect, validateVestTree imports
# 3. Replace suite property with form() + effect()
# 4. Remove onFormChange if only forwarding
# 5. Replace <form scVestForm ...> with <form novalidate>
# 6. If file has validationResult computed → KEEP it for error display

# Type-check after each lib:
npx tsc --noEmit -p libs/subject/address/ui/tsconfig.json
npx tsc --noEmit -p libs/subject/group/ui/tsconfig.json
npx tsc --noEmit -p libs/subject/org/ui/tsconfig.json
npx tsc --noEmit -p libs/subject/person/ui/tsconfig.json
```

- [ ] **Step 2: Commit subject domain**

```bash
git add libs/subject/address/ui libs/subject/group/ui libs/subject/org/ui libs/subject/person/ui
git commit -m "feat(subject-ui): migrate address, group, org, person forms to Angular Signal Forms"
```

---

## Task 6: Migrate relationship domain forms

Apply the **standard recipe** to each form. All use `model.required<T>()`.

**Forms and suites:**

| File | Suite | Import from |
|------|-------|-------------|
| `libs/relationship/invitation/ui/src/lib/invitation.form.ts` | `invitationValidations` | `@bk2/relationship-invitation-util` |
| `libs/relationship/membership/ui/src/lib/membership.form.ts` | `membershipValidations` | `@bk2/relationship-membership-util` |
| `libs/relationship/membership/ui/src/lib/member-new.form.ts` | `memberNewFormValidations` | `@bk2/relationship-membership-util` |
| `libs/relationship/membership/ui/src/lib/category-change.form.ts` | `categoryChangeFormValidations` | `@bk2/relationship-membership-util` |
| `libs/relationship/membership/ui/src/lib/scs-member-fee-edit.form.ts` | `scsMemberFeeValidations` | `@bk2/relationship-membership-util` |
| `libs/relationship/ownership/ui/src/lib/ownership-form.ts` | `ownershipValidations` | `@bk2/relationship-ownership-util` |
| `libs/relationship/ownership/feature/src/lib/ownership-new.form.ts` | `ownershipValidations` | `@bk2/relationship-ownership-util` |
| `libs/relationship/personal-rel/ui/src/lib/personal-rel.form.ts` | `personalRelValidations` | `@bk2/relationship-personal-rel-util` |
| `libs/relationship/reservation/ui/src/lib/reservation.form.ts` | `reservationValidations` | `@bk2/relationship-reservation-util` |
| `libs/relationship/reservation/ui/src/lib/reservation-apply.form.ts` | `reservationApplyValidations` | `@bk2/relationship-reservation-util` |
| `libs/relationship/responsibility/ui/src/lib/responsibility.form.ts` | `responsibilityValidations` | `@bk2/relationship-responsibility-util` |
| `libs/relationship/transfer/ui/src/lib/transfer.form.ts` | `transferValidations` | `@bk2/relationship-transfer-util` |
| `libs/relationship/workrel/ui/src/lib/workrel.form.ts` | `workrelValidations` | `@bk2/relationship-workrel-util` |

**Note on `scs-member-fee-edit.form.ts`:** Uses `input<ScsMemberFeesModel | undefined>(undefined)` (optional, not required). Check if Signal Forms `form()` works with an optional signal. If it doesn't, use:
```ts
// Conditional form: only create form when formData has a value
protected readonly memberFeeForm = computed(() =>
  this.formData() != null
    ? form(this.formData as WritableSignal<ScsMemberFeesModel>, (path) =>
        validateVestTree(path, scsMemberFeeValidations as any))
    : null,
);
```
Or leave valid emission as a signal if `valid` output is even present.

**Note on `ownership-new.form.ts`:** This is in the `feature` layer, not `ui`. Check that the feature lib's package.json has `@bk2/shared-util-angular`.

- [ ] **Step 1: For each form — read, apply recipe, type-check**

```bash
# For each form: read, apply recipe, type-check
cat libs/relationship/invitation/ui/src/lib/invitation.form.ts
# Apply standard recipe...
npx tsc --noEmit -p libs/relationship/invitation/ui/tsconfig.json

# Repeat for each lib
npx tsc --noEmit -p libs/relationship/membership/ui/tsconfig.json
npx tsc --noEmit -p libs/relationship/ownership/ui/tsconfig.json
npx tsc --noEmit -p libs/relationship/ownership/feature/tsconfig.json
npx tsc --noEmit -p libs/relationship/personal-rel/ui/tsconfig.json
npx tsc --noEmit -p libs/relationship/reservation/ui/tsconfig.json
npx tsc --noEmit -p libs/relationship/responsibility/ui/tsconfig.json
npx tsc --noEmit -p libs/relationship/transfer/ui/tsconfig.json
npx tsc --noEmit -p libs/relationship/workrel/ui/tsconfig.json
```

- [ ] **Step 2: Commit relationship domain**

```bash
git add libs/relationship/
git commit -m "feat(relationship-ui): migrate all relationship forms to Angular Signal Forms"
```

---

## Task 7: Migrate CMS domain forms + trivial removals

Apply the **standard recipe** to the three CMS forms with suites. Apply the **trivial removal** for two section configurations.

**Forms with suites:**

| File | Suite | Import from |
|------|-------|-------------|
| `libs/cms/page/ui/src/lib/page.form.ts` | `pageValidations` | `@bk2/cms-page-util` |
| `libs/cms/menu/ui/src/lib/menu.form.ts` | `menuItemValidations` | `@bk2/cms-menu-util` |
| `libs/cms/icon/ui/src/lib/icon-edit.form.ts` | `iconValidations` | `@bk2/cms-icon-util` |

**Trivial removals (no suite, no validation bridge needed):**

| File | Change |
|------|--------|
| `libs/cms/section/ui/src/lib/album-configuration.ts` | Remove `vestForms` from imports[] and the import statement. Keep `FormsModule`. |
| `libs/cms/section/ui/src/lib/people-configuration.ts` | Same. |
| `libs/subject/application/ui/src/lib/application.form.ts` | Same. |

- [ ] **Step 1: Migrate page.form, menu.form, icon-edit.form**

```bash
cat libs/cms/page/ui/src/lib/page.form.ts
cat libs/cms/page/ui/package.json

# Apply standard recipe to each
# Add @bk2/shared-util-angular to cms/page/ui, cms/menu/ui, cms/icon/ui package.json if missing
npx tsc --noEmit -p libs/cms/page/ui/tsconfig.json
npx tsc --noEmit -p libs/cms/menu/ui/tsconfig.json
npx tsc --noEmit -p libs/cms/icon/ui/tsconfig.json
```

- [ ] **Step 2: Apply trivial removals**

For each of `album-configuration.ts`, `people-configuration.ts`, `application.form.ts`:
1. Remove: `import { vestForms } from 'ngx-vest-forms';`
2. Remove `vestForms` from the `imports` array in `@Component`.
3. Keep everything else unchanged.

```bash
npx tsc --noEmit -p libs/cms/section/ui/tsconfig.json
npx tsc --noEmit -p libs/subject/application/ui/tsconfig.json
```

- [ ] **Step 3: Commit CMS domain**

```bash
git add libs/cms/ libs/subject/application/
git commit -m "feat(cms-ui): migrate CMS forms to Angular Signal Forms; remove vestForms from section configs"
```

---

## Task 8: Migrate geo/location, calevent, document, resource, task forms

Apply the **standard recipe** to each. All use `model.required<T>()`.

| File | Suite | Import from |
|------|-------|-------------|
| `libs/geo/location/ui/src/lib/location.form.ts` | `locationValidations` | `@bk2/geo-location-util` |
| `libs/calevent/ui/src/lib/calevent.form.ts` | `calEventValidations` | `@bk2/calevent-util` |
| `libs/document/ui/src/lib/document.form.ts` | `documentValidations` | `@bk2/document-util` |
| `libs/resource/ui/src/lib/resource.form.ts` | `resourceValidations` | `@bk2/resource-util` |
| `libs/task/ui/src/lib/task.form.ts` | `taskValidations` | `@bk2/task-util` |

- [ ] **Step 1: Read, apply recipe, type-check each**

```bash
# For each file: read, apply recipe, type-check its lib
npx tsc --noEmit -p libs/geo/location/ui/tsconfig.json
npx tsc --noEmit -p libs/calevent/ui/tsconfig.json
npx tsc --noEmit -p libs/document/ui/tsconfig.json
npx tsc --noEmit -p libs/resource/ui/tsconfig.json
npx tsc --noEmit -p libs/task/ui/tsconfig.json
```

- [ ] **Step 2: Commit**

```bash
git add libs/geo/location/ui libs/calevent/ui libs/document/ui libs/resource/ui libs/task/ui
git commit -m "feat(geo/calevent/document/resource/task-ui): migrate forms to Angular Signal Forms"
```

---

## Task 9: Migrate user and profile forms

Apply the **standard recipe** to each. All use `model.required<T>()`. User lib package.json likely already has `@bk2/shared-util-angular`.

| File | Suite | Import from |
|------|-------|-------------|
| `libs/user/ui/src/lib/fbuser.form.ts` | `firebaseUserFormValidations` | `@bk2/user-util` |
| `libs/user/ui/src/lib/user-auth.form.ts` | `userAuthFormValidations` | `@bk2/user-util` |
| `libs/user/ui/src/lib/user-display.form.ts` | `userDisplayFormValidations` | `@bk2/user-util` |
| `libs/user/ui/src/lib/user-model.form.ts` | `userModelFormValidations` | `@bk2/user-util` |
| `libs/user/ui/src/lib/user-notification.form.ts` | `userNotificationFormValidations` | `@bk2/user-util` |
| `libs/user/ui/src/lib/user-privacy.form.ts` | `userPrivacyFormValidations` | `@bk2/user-util` |
| `libs/profile/ui/src/lib/profile-data.form.ts` | `personValidations` | `@bk2/subject-person-util` |
| `libs/profile/ui/src/lib/profile-privacy.form.ts` | `userValidations` | `@bk2/user-util` |
| `libs/profile/ui/src/lib/profile-settings.form.ts` | `userValidations` | `@bk2/user-util` |

- [ ] **Step 1: Read, apply recipe, type-check**

```bash
npx tsc --noEmit -p libs/user/ui/tsconfig.json
npx tsc --noEmit -p libs/profile/ui/tsconfig.json
```

- [ ] **Step 2: Commit**

```bash
git add libs/user/ui libs/profile/ui
git commit -m "feat(user/profile-ui): migrate all user and profile forms to Angular Signal Forms"
```

---

## Task 10: Migrate finance forms (includes input→model conversion)

Apply the **standard recipe** to expense and account. Apply **input→model recipe** to invoice-edit and bexio-invoice-new (same pattern as Task 3 folder.form.ts).

| File | Suite | Import from | Type |
|------|-------|-------------|------|
| `libs/finance/account/ui/src/lib/account.form.ts` | `accountValidations` | `@bk2/finance-account-util` | Standard |
| `libs/finance/expense/ui/src/lib/expense.form.ts` | `expenseValidations` | `@bk2/finance-expense-util` | Standard |
| `libs/finance/invoice/ui/src/lib/invoice-edit.form.ts` | `invoiceValidations` | `@bk2/finance-invoice-util` | input→model |
| `libs/finance/invoice/ui/src/lib/bexio-invoice-new.form.ts` | `bexioInvoiceValidations` | `@bk2/finance-invoice-util` | input→model |

**For invoice-edit.form.ts and bexio-invoice-new.form.ts (input→model):**
1. Change `public readonly formData = input.required<T>();` → `public formData = model.required<T>();`
2. Remove `public readonly formDataChange = output<T>();`
3. Update `onFieldChange` to `this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));` (not `this.formDataChange.emit(...)`).
4. Verify callers use `[(formData)]` or both `[formData]` + `(formDataChange)`.

- [ ] **Step 1: Read all four forms**

```bash
cat libs/finance/account/ui/src/lib/account.form.ts
cat libs/finance/expense/ui/src/lib/expense.form.ts
cat libs/finance/invoice/ui/src/lib/invoice-edit.form.ts
cat libs/finance/invoice/ui/src/lib/bexio-invoice-new.form.ts
```

- [ ] **Step 2: Add package deps if needed**

```bash
cat libs/finance/account/ui/package.json
cat libs/finance/invoice/ui/package.json
# Add @bk2/shared-util-angular + @angular/forms if missing
# Add tsconfig reference for each
```

- [ ] **Step 3: Apply migrations**

Apply standard recipe to account.form and expense.form. Apply input→model recipe to invoice-edit.form and bexio-invoice-new.form.

```bash
npx tsc --noEmit -p libs/finance/account/ui/tsconfig.json
npx tsc --noEmit -p libs/finance/expense/ui/tsconfig.json
npx tsc --noEmit -p libs/finance/invoice/ui/tsconfig.json
```

- [ ] **Step 4: Commit**

```bash
git add libs/finance/
git commit -m "feat(finance-ui): migrate finance forms to Angular Signal Forms"
```

---

## Task 11: Phase 4 cleanup — remove vestFormsViewProviders from shared/ui

**Prerequisite:** All 35 form migrations above must be complete. Once no parent component uses `scVestForm`, the `vestFormsViewProviders` in child inputs is dead code.

**Files to update** (remove `vestFormsViewProviders` from `viewProviders` and remove its import):

```
libs/shared/ui/src/lib/category-old.ts
libs/shared/ui/src/lib/category-select.ts
libs/shared/ui/src/lib/chips.ts
libs/shared/ui/src/lib/color.ts
libs/shared/ui/src/lib/date-input.ts
libs/shared/ui/src/lib/editor.ts
libs/shared/ui/src/lib/email-input.ts
libs/shared/ui/src/lib/iban-input.ts
libs/shared/ui/src/lib/icon-input.ts
libs/shared/ui/src/lib/image-url-input.ts
libs/shared/ui/src/lib/notes-input.ts
libs/shared/ui/src/lib/number-input.ts
libs/shared/ui/src/lib/password-input.ts
libs/shared/ui/src/lib/phone-input.ts
libs/shared/ui/src/lib/string-select.ts
libs/shared/ui/src/lib/time-input.ts
libs/shared/ui/src/lib/url-input.ts
```

**IMPORTANT:** Each of these has `[ngModel]` internally. After removing `vestFormsViewProviders`, the ngModel inside the component needs a ControlContainer from the parent. Since parent forms now have `<form novalidate>` (no `[formGroup]` or `NgForm`), you may need to provide `ControlContainer` some other way, OR replace `[ngModel]` with direct signal bindings (using `linkedSignal`). 

**Recommended approach:** Replace `[ngModel]="value()" (ngModelChange)="value.set($event)"` with direct Ionic value binding:
```html
<!-- Replace: -->
<ion-input [ngModel]="value()" (ngModelChange)="value.set($event)" [name]="i18n().name" />

<!-- With: -->
<ion-input [value]="value()" (ionInput)="value.set($event.detail.value)" />
```
This removes the dependency on Angular FormsModule entirely, which is the correct long-term direction.

- [ ] **Step 1: Verify all parent forms are migrated**

```bash
grep -r "scVestForm\|ngxVestForm" libs apps --include="*.ts" --include="*.html"
```

Expected: zero results.

- [ ] **Step 2: For each shared/ui component, replace ngModel with direct Ionic binding**

For each file:
1. Remove `import { vestFormsViewProviders } from 'ngx-vest-forms';`
2. Remove `viewProviders: [vestFormsViewProviders],`
3. Replace `[ngModel]="value()" (ngModelChange)="value.set($event)"` with the appropriate Ionic event binding.
4. Remove `FormsModule` from `imports` array if it was only there for ngModel support.

- [ ] **Step 3: Type-check shared-ui**

```bash
npx tsc --noEmit -p libs/shared/ui/tsconfig.json
```

- [ ] **Step 4: Verify all tests still pass**

```bash
pnpm run test shared-ui
```

- [ ] **Step 5: Remove ngx-vest-forms from package.json**

```bash
# Confirm no more imports:
grep -r "ngx-vest-forms" libs apps --include="*.ts" --include="*.json" | grep -v node_modules

# Remove from root package.json or any lib package.json that still lists it:
# Edit the relevant package.json files to remove "ngx-vest-forms" from dependencies
pnpm install
```

- [ ] **Step 6: Confirm vest is still in dependencies**

```bash
grep '"vest"' package.json
# Must still be present — vest suites are not removed
```

- [ ] **Step 7: Final type-check and test**

```bash
npx tsc --noEmit -p tsconfig.json
pnpm run testlibs
```

- [ ] **Step 8: Commit cleanup**

```bash
git add libs/shared/ui package.json pnpm-lock.yaml
git commit -m "feat(shared-ui): remove vestFormsViewProviders; drop ngx-vest-forms dependency"
```

---

## Self-Review Against Spec

**§3 Constraints:**
- Suites unchanged ✅ — no suite file is modified
- One shared bridge ✅ — `validateVestTree` in `@bk2/shared-util-angular`
- Behavior parity ✅ — bridge calls suite same as ngx-vest-forms (model-only); `validationResult` preserved where used for error display
- Incremental ✅ — per-form/per-domain tasks, each independently committable
- `only()` stays unconditional ✅ — bridge calls `suite(model)` without a `field` arg, so `only()` doesn't fire (full suite runs)

**§5.2 Async suites:** All suites in this codebase are synchronous — no async handling needed. ✅ N/A

**§5.3 Cross-field validation:** All cross-field rules are in the Vest suite; `validateVestTree` runs the whole suite on every model change. `validationConfig` re-validation maps were never present (ngx-vest-forms handled this). ✅

**§5.5 Vest warnings (`warn()`):** No `warn()` usage found in the codebase during survey. ✅ N/A

**§7 State CSS classes:** No `ng-touched` / `ng-invalid` CSS found — `provideSignalFormsConfig(NG_STATUS_CLASSES)` is NOT needed. ✅

**§8 Submission:** Each form emits `valid` and `dirty` outputs; parent modals handle submission. `submit()` from Signal Forms is not needed (parent controls save logic). ✅ N/A

**Gaps found and addressed:**
- Login form's dynamic suite selection: noted in Task 2 with two approaches.
- `scs-member-fee-edit.form.ts` uses optional `input<T | undefined>` — noted in Task 6.
- Phase 4 shared/ui cleanup requires replacing ngModel with Ionic direct bindings — noted in Task 11.

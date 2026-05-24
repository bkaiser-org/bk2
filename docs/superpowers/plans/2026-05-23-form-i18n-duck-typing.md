# Form i18n Duck-Typing Migration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate all *.form.ts ui components from self-contained I18nService injection (Pattern B) to the correct duck-typing pattern (Pattern A), where forms receive translated strings via `input.required<XyzFormI18n>()` from the parent modal/page store.

**Architecture:** Each form exports a minimal `XyzFormI18n` interface with only the keys the form uses, all typed as `Signal<string>`. The parent feature store extends its `FEATURE_I18N_KEYS` const with those key strings. The parent modal passes `[i18n]="store.i18n"` to the form. TypeScript structural subtyping validates the match without any unwrapping or key renaming.

**Tech Stack:** Angular 20 signals, NgRx Signal Stores, Transloco (`I18nService.translateAll`), TypeScript strict.

---

## Scope

### Forms needing migration (Pattern B → A): 26 files

| Domain | Forms |
|--------|-------|
| `subject/person/ui` | `person.form.ts`, `person-new.form.ts` |
| `subject/org/ui` | `org.form.ts`, `org-new.form.ts` |
| `subject/group/ui` | `group.form.ts` |
| `subject/address/ui` | `address.form.ts` |
| `user/ui` | `user-privacy.form.ts` |
| `cms/menu/ui` | `menu.form.ts` |
| `cms/page/ui` | `page.form.ts` |
| `cms/section/ui` | `section.form.ts` |
| `finance/account/ui` | `account.form.ts` |
| `finance/invoice/ui` | `invoice-edit.form.ts`, `bexio-invoice-new.form.ts` |
| `geo/location/ui` | `location.form.ts` |
| `relationship/invitation/ui` | `invitation.form.ts` |
| `relationship/membership/ui` | `category-change.form.ts`, `member-new.form.ts`, `membership.form.ts`, `scs-member-fee-edit.form.ts` |
| `relationship/personal-rel/ui` | `personal-rel.form.ts` |
| `relationship/reservation/ui` | `reservation.form.ts`, `reservation-apply.form.ts` |
| `relationship/responsibility/ui` | `responsibility.form.ts` |
| `relationship/transfer/ui` | `transfer.form.ts` |
| `relationship/workrel/ui` | `workrel.form.ts` |

### Pattern A forms with hardcoded template keys to fix: 2 files
- `calevent/ui`: `calevent.form.ts`
- `chat/ui`: `poll-create.form.ts`

### Already correct (Pattern A) — no changes needed
`login.form.ts`, `room-edit.form.ts`, `category.form.ts`, `document.form.ts`, `folder.form.ts`, `icon-edit.form.ts`, `profile-privacy.form.ts`, `profile-settings.form.ts`, `resource.form.ts`, `task.form.ts`, `fbuser.form.ts`, `user-auth.form.ts`, `user-display.form.ts`, `user-model.form.ts`, `user-notification.form.ts`, `ownership-new.form.ts` (in feature layer, correctly injects own store).

---

## Migration Pattern Reference

For every Pattern B form, apply the following mechanical transformation:

### Step A — form file changes

1. Remove `import { I18nService } from '@bk2/shared-i18n'`
2. Remove `import { PFX } from './scope'`
3. Remove `inject` from `@angular/core` import if no longer used elsewhere
4. Add `Signal` to the `@angular/core` import
5. Export a new interface above `@Component`:

```ts
export interface XyzFormI18n {
  key1_label: Signal<string>;
  key1_placeholder: Signal<string>;
  key1_helper: Signal<string>;
  // ... one entry per key in the current translateAll({}) object
}
```

6. Replace:

```ts
private readonly i18nService = inject(I18nService);
protected readonly fieldI18n = this.i18nService.translateAll({ ... });
```

with:

```ts
public readonly i18n = input.required<XyzFormI18n>();
```

7. Update every computed i18n getter: replace `this.fieldI18n.key()` → `this.i18n().key()`

### Step B — feature store changes

Add all form field keys to the store's existing `FEATURE_I18N_KEYS` const, using the full Transloco key string (keep the original `@scope/ui.` prefix from `PFX` in the form's `scope.ts`):

```ts
// xyz form field keys (from @scope/xyz/ui)
key1_label:       '@scope/xyz/ui.key1.label',
key1_placeholder: '@scope/xyz/ui.key1.placeholder',
key1_helper:      '@scope/xyz/ui.key1.helper',
```

The `XyzI18n` type (defined as `{ [K in keyof typeof XYZ_I18N_KEYS]: Signal<string> }`) will automatically include the new keys.

### Step C — parent modal/page changes

Add `[i18n]="store.i18n"` to the form component's usage in the template.

### Step D — verify de.json

The translated strings live in `libs/<domain>/ui/src/i18n/de.json` (or the i18n file matching `@scope/xxx/ui`). Confirm every key used in the old `translateAll` call has a corresponding entry in that file. Add missing entries in German.

### Step E — type-check

```bash
npx tsc --noEmit -p libs/<domain>/ui/tsconfig.json
npx tsc --noEmit -p libs/<domain>/feature/tsconfig.json
```

---

## Task 1: Migrate `person.form.ts` — reference implementation

**Files:**
- Modify: `libs/subject/person/ui/src/lib/person.form.ts`
- Modify: `libs/subject/person/feature/src/lib/person.store.ts`
- Modify: `libs/subject/person/feature/src/lib/person-edit.modal.ts`
- Modify: `libs/subject/person/feature/src/lib/person-edit.page.ts` (if it uses `<bk-person-form>`)
- Check: `libs/subject/person/ui/src/i18n/de.json`

- [ ] **Step 1: Export `PersonFormI18n` interface in person.form.ts**

Remove the I18nService injection block (lines 105-130) and the `import { I18nService }` and `import { PFX }` imports. Add `Signal` to the angular core import. Add above `@Component`:

```ts
export interface PersonFormI18n {
  bkey_label: Signal<string>;
  bkey_placeholder: Signal<string>;
  bkey_helper: Signal<string>;
  firstName_label: Signal<string>;
  firstName_placeholder: Signal<string>;
  firstName_helper: Signal<string>;
  lastName_label: Signal<string>;
  lastName_placeholder: Signal<string>;
  lastName_helper: Signal<string>;
  ssnId_label: Signal<string>;
  ssnId_placeholder: Signal<string>;
  ssnId_helper: Signal<string>;
  bexioId_label: Signal<string>;
  bexioId_placeholder: Signal<string>;
  bexioId_helper: Signal<string>;
  notes_label: Signal<string>;
  notes_placeholder: Signal<string>;
  dateOfBirth_label: Signal<string>;
  dateOfBirth_placeholder: Signal<string>;
  dateOfBirth_helper: Signal<string>;
  dateOfDeath_label: Signal<string>;
  dateOfDeath_placeholder: Signal<string>;
  dateOfDeath_helper: Signal<string>;
}
```

- [ ] **Step 2: Replace I18nService injection with i18n input in person.form.ts**

In the class body, replace the `i18nService`/`fieldI18n` lines with the input declaration (place it at the top of the inputs block):

```ts
public readonly i18n = input.required<PersonFormI18n>();
```

Then update the computed getters (lines 131-138) to read from `this.i18n()` instead of `this.fieldI18n`:

```ts
protected bkeyI18n = computed(() => ({
  name: 'bkey',
  label: this.i18n().bkey_label(),
  placeholder: this.i18n().bkey_placeholder(),
  helper: this.i18n().bkey_helper()
} as TextInputI18n));

protected firstNameI18n = computed(() => ({
  name: 'firstName',
  label: this.i18n().firstName_label(),
  placeholder: this.i18n().firstName_placeholder(),
  helper: this.i18n().firstName_helper()
} as TextInputI18n));

protected lastNameI18n = computed(() => ({
  name: 'lastName',
  label: this.i18n().lastName_label(),
  placeholder: this.i18n().lastName_placeholder(),
  helper: this.i18n().lastName_helper()
} as TextInputI18n));

protected ssnIdI18n = computed(() => ({
  name: 'ssnId',
  label: this.i18n().ssnId_label(),
  placeholder: this.i18n().ssnId_placeholder(),
  helper: this.i18n().ssnId_helper()
} as TextInputI18n));

protected bexioIdI18n = computed(() => ({
  name: 'bexioId',
  label: this.i18n().bexioId_label(),
  placeholder: this.i18n().bexioId_placeholder(),
  helper: this.i18n().bexioId_helper()
} as TextInputI18n));

protected notesI18n = computed(() => ({
  name: 'notes',
  label: this.i18n().notes_label(),
  placeholder: this.i18n().notes_placeholder()
} as NotesInputI18n));

protected dateOfBirthI18n = computed(() => ({
  name: 'dateOfBirth',
  label: this.i18n().dateOfBirth_label(),
  placeholder: this.i18n().dateOfBirth_placeholder(),
  helper: this.i18n().dateOfBirth_helper()
} as DateInputI18n));

protected dateOfDeathI18n = computed(() => ({
  name: 'dateOfDeath',
  label: this.i18n().dateOfDeath_label(),
  placeholder: this.i18n().dateOfDeath_placeholder(),
  helper: this.i18n().dateOfDeath_helper()
} as DateInputI18n));
```

- [ ] **Step 3: Add person form keys to PersonStore's PERSON_I18N_KEYS**

In `libs/subject/person/feature/src/lib/person.store.ts`, add to the existing `PERSON_I18N_KEYS` const (after the last existing entry, before `} satisfies Record<string, string>`):

```ts
  // person form field keys (from @subject/person/ui)
  bkey_label:               '@subject/person/ui.bkey.label',
  bkey_placeholder:         '@subject/person/ui.bkey.placeholder',
  bkey_helper:              '@subject/person/ui.bkey.helper',
  firstName_label:          '@subject/person/ui.firstName.label',
  firstName_placeholder:    '@subject/person/ui.firstName.placeholder',
  firstName_helper:         '@subject/person/ui.firstName.helper',
  lastName_label:           '@subject/person/ui.lastName.label',
  lastName_placeholder:     '@subject/person/ui.lastName.placeholder',
  lastName_helper:          '@subject/person/ui.lastName.helper',
  ssnId_label:              '@subject/person/ui.ssnId.label',
  ssnId_placeholder:        '@subject/person/ui.ssnId.placeholder',
  ssnId_helper:             '@subject/person/ui.ssnId.helper',
  bexioId_label:            '@subject/person/ui.bexioId.label',
  bexioId_placeholder:      '@subject/person/ui.bexioId.placeholder',
  bexioId_helper:           '@subject/person/ui.bexioId.helper',
  notes_label:              '@subject/person/ui.notes.label',
  notes_placeholder:        '@subject/person/ui.notes.placeholder',
  dateOfBirth_label:        '@subject/person/ui.dateOfBirth.label',
  dateOfBirth_placeholder:  '@subject/person/ui.dateOfBirth.placeholder',
  dateOfBirth_helper:       '@subject/person/ui.dateOfBirth.helper',
  dateOfDeath_label:        '@subject/person/ui.dateOfDeath.label',
  dateOfDeath_placeholder:  '@subject/person/ui.dateOfDeath.placeholder',
  dateOfDeath_helper:       '@subject/person/ui.dateOfDeath.helper',
```

- [ ] **Step 4: Update person-edit.modal.ts template to pass [i18n]**

In `libs/subject/person/feature/src/lib/person-edit.modal.ts`, find the `<bk-person-form ...>` usage in the template and add `[i18n]="store.i18n"`:

```html
<bk-person-form
    [formData]="formData"
    (formDataChange)="onFormDataChange($event)"
    [currentUser]="currentUser()"
    [priv]="priv()"
    [genders]="genders()"
    [showForm]="showForm()"
    [allTags]="tags()"
    [tenantId]="tenantId()"
    [readOnly]="isReadOnly()"
    [i18n]="store.i18n"
    (dirty)="formDirty.set($event)"
    (valid)="formValid.set($event)"
/>
```

- [ ] **Step 5: Check person-edit.page.ts for `<bk-person-form>` and add [i18n] if present**

Read `libs/subject/person/feature/src/lib/person-edit.page.ts`. If it uses `<bk-person-form>`, add `[i18n]="store.i18n"` there too.

- [ ] **Step 6: Verify de.json**

Check `libs/subject/person/ui/src/i18n/de.json` contains entries for: `bkey`, `firstName`, `lastName`, `ssnId`, `bexioId`, `notes`, `dateOfBirth`, `dateOfDeath` — each with `label`, `placeholder` (and `helper` where the form uses it). All keys were confirmed present during planning; no changes needed.

- [ ] **Step 7: Type-check**

```bash
npx tsc --noEmit -p libs/subject/person/ui/tsconfig.json
npx tsc --noEmit -p libs/subject/person/feature/tsconfig.json
```

Both must pass with zero errors.

- [ ] **Step 8: Commit**

```bash
git add libs/subject/person/ui/src/lib/person.form.ts \
        libs/subject/person/feature/src/lib/person.store.ts \
        libs/subject/person/feature/src/lib/person-edit.modal.ts \
        libs/subject/person/feature/src/lib/person-edit.page.ts
git commit -m "refactor(subject/person): migrate person.form to duck-typing i18n input"
```

---

## Task 2: Migrate `person-new.form.ts`

**Files:**
- Modify: `libs/subject/person/ui/src/lib/person-new.form.ts`
- Modify: `libs/subject/person/feature/src/lib/person.store.ts` (same store, add more keys)
- Modify: `libs/subject/person/feature/src/lib/person-new.modal.ts`

- [ ] **Step 1: Read person-new.form.ts**

Read `libs/subject/person/ui/src/lib/person-new.form.ts`. Note the full `translateAll({...})` call starting at line 279. Extract every key-value pair.

- [ ] **Step 2: Read person-new.form.ts scope.ts**

Read `libs/subject/person/ui/src/lib/scope.ts` to confirm the `PFX` value (expected: `'@subject/person/ui.'`).

- [ ] **Step 3: Export PersonNewFormI18n interface**

Above `@Component` in person-new.form.ts, add:

```ts
export interface PersonNewFormI18n {
  // one Signal<string> property per key found in Step 1's translateAll call
  // e.g.: firstName_label: Signal<string>; firstName_placeholder: Signal<string>; ...
}
```

Use the exact key names from the `translateAll` object (the property names like `firstName_label`, not the Transloco paths).

- [ ] **Step 4: Apply migration pattern**

Remove `I18nService` injection and `PFX` import. Replace `fieldI18n` with `public readonly i18n = input.required<PersonNewFormI18n>()`. Update all computed i18n getters from `this.fieldI18n.key()` to `this.i18n().key()`.

- [ ] **Step 5: Add person-new form keys to PersonStore**

Add to `PERSON_I18N_KEYS` in `person.store.ts` all keys from person-new.form.ts's old `translateAll` call, using the pattern `key_name: '@subject/person/ui.dot.path'` (matching the original `PFX + 'dot.path'` string).

- [ ] **Step 6: Update person-new.modal.ts**

Read `libs/subject/person/feature/src/lib/person-new.modal.ts`. Find `<bk-person-new-form ...>` and add `[i18n]="store.i18n"`.

- [ ] **Step 7: Verify de.json**

Check `libs/subject/person/ui/src/i18n/de.json` has entries for all keys used in person-new.form.ts's old `translateAll`. Add any missing German translations.

- [ ] **Step 8: Type-check and commit**

```bash
npx tsc --noEmit -p libs/subject/person/ui/tsconfig.json
npx tsc --noEmit -p libs/subject/person/feature/tsconfig.json
git add libs/subject/person/ui/src/lib/person-new.form.ts \
        libs/subject/person/feature/src/lib/person.store.ts \
        libs/subject/person/feature/src/lib/person-new.modal.ts
git commit -m "refactor(subject/person): migrate person-new.form to duck-typing i18n input"
```

---

## Task 3: Migrate `org.form.ts` and `org-new.form.ts`

**Files:**
- Modify: `libs/subject/org/ui/src/lib/org.form.ts`
- Modify: `libs/subject/org/ui/src/lib/org-new.form.ts`
- Modify: `libs/subject/org/feature/src/lib/org.store.ts` (add keys from both forms)
- Modify: parent modal(s) that use `<bk-org-form>` and `<bk-org-new-form>`

- [ ] **Step 1: Read both form files and their scope.ts**

Read `libs/subject/org/ui/src/lib/org.form.ts`, `libs/subject/org/ui/src/lib/org-new.form.ts`, and `libs/subject/org/ui/src/lib/scope.ts` (for the `PFX` value). Extract the `translateAll({...})` key maps from both.

- [ ] **Step 2: Read org.store.ts and existing OrgI18n**

Read `libs/subject/org/feature/src/lib/org.store.ts`. Find `ORG_I18N_KEYS` const and `OrgI18n` type.

- [ ] **Step 3: Export OrgFormI18n in org.form.ts**

Export an `OrgFormI18n` interface above `@Component` in org.form.ts, with one `Signal<string>` per key in its `translateAll` call.

- [ ] **Step 4: Export OrgNewFormI18n in org-new.form.ts**

Export an `OrgNewFormI18n` interface above `@Component` in org-new.form.ts, with one `Signal<string>` per key in its `translateAll` call.

- [ ] **Step 5: Apply migration pattern to org.form.ts**

Remove I18nService injection, add `public readonly i18n = input.required<OrgFormI18n>()`, update computed getters.

- [ ] **Step 6: Apply migration pattern to org-new.form.ts**

Remove I18nService injection, add `public readonly i18n = input.required<OrgNewFormI18n>()`, update computed getters.

- [ ] **Step 7: Add both form key sets to OrgStore's ORG_I18N_KEYS**

Add all keys from org.form.ts's old `translateAll` and org-new.form.ts's old `translateAll`, using `'@subject/org/ui.dot.path'` style strings.

- [ ] **Step 8: Find and update parent modals**

```bash
grep -rn "bk-org-form\|bk-org-new-form" libs/subject/org/feature/src --include="*.ts"
```

Add `[i18n]="store.i18n"` to each `<bk-org-form>` and `<bk-org-new-form>` usage.

- [ ] **Step 9: Verify de.json and type-check**

Check `libs/subject/org/ui/src/i18n/de.json` for all keys. Run:

```bash
npx tsc --noEmit -p libs/subject/org/ui/tsconfig.json
npx tsc --noEmit -p libs/subject/org/feature/tsconfig.json
```

- [ ] **Step 10: Commit**

```bash
git add libs/subject/org/ui/src/lib/org.form.ts \
        libs/subject/org/ui/src/lib/org-new.form.ts \
        libs/subject/org/feature/src/lib/org.store.ts
git commit -m "refactor(subject/org): migrate org and org-new forms to duck-typing i18n input"
```

---

## Task 4: Migrate `group.form.ts`

**Files:**
- Modify: `libs/subject/group/ui/src/lib/group.form.ts`
- Modify: `libs/subject/group/feature/src/lib/group.store.ts`
- Modify: parent modal(s)

- [ ] **Step 1: Read the form and store**

Read `libs/subject/group/ui/src/lib/group.form.ts` (translateAll starts at line 223) and `libs/subject/group/ui/src/lib/scope.ts`. Read `libs/subject/group/feature/src/lib/group.store.ts` to find the store's KEYS const.

- [ ] **Step 2: Export GroupFormI18n, apply migration pattern**

Export `GroupFormI18n` interface. Remove I18nService. Add `input.required<GroupFormI18n>()`. Update computed getters.

- [ ] **Step 3: Add keys to GroupStore**

Add all form keys to the store's KEYS const using the `'@subject/group/ui.'` prefix.

- [ ] **Step 4: Find and update parent modal**

```bash
grep -rn "bk-group-form" libs/subject/group/feature/src --include="*.ts"
```

Add `[i18n]="store.i18n"`.

- [ ] **Step 5: Verify de.json, type-check, commit**

```bash
npx tsc --noEmit -p libs/subject/group/ui/tsconfig.json
npx tsc --noEmit -p libs/subject/group/feature/tsconfig.json
git add libs/subject/group/ui/src/lib/group.form.ts \
        libs/subject/group/feature/src/lib/group.store.ts
git commit -m "refactor(subject/group): migrate group.form to duck-typing i18n input"
```

---

## Task 5: Migrate `address.form.ts`

**Files:**
- Modify: `libs/subject/address/ui/src/lib/address.form.ts`
- Modify: `libs/subject/address/feature/src/lib/address.store.ts`
- Modify: parent modal(s)

- [ ] **Step 1: Read form and scope.ts**

Read `libs/subject/address/ui/src/lib/address.form.ts` (translateAll at line 184) and `libs/subject/address/ui/src/lib/scope.ts`.

- [ ] **Step 2: Export AddressFormI18n, apply migration pattern**

Export `AddressFormI18n` interface. Remove I18nService. Add `input.required<AddressFormI18n>()`. Update computed getters.

- [ ] **Step 3: Find the feature store and add keys**

```bash
find libs/subject/address/feature/src -name "*.store.ts"
```

Add all form keys to the store's KEYS const using `'@subject/address/ui.'` prefix.

- [ ] **Step 4: Find and update parent modal(s)**

```bash
grep -rn "bk-address-form" libs/subject/address/feature/src --include="*.ts"
```

Add `[i18n]="store.i18n"` where needed.

- [ ] **Step 5: Verify de.json, type-check, commit**

Check `libs/subject/address/ui/src/i18n/de.json`. Run:

```bash
npx tsc --noEmit -p libs/subject/address/ui/tsconfig.json
npx tsc --noEmit -p libs/subject/address/feature/tsconfig.json
git add libs/subject/address/ui/src/lib/address.form.ts \
        libs/subject/address/feature/src/lib/address.store.ts
git commit -m "refactor(subject/address): migrate address.form to duck-typing i18n input"
```

---

## Task 6: Migrate `user-privacy.form.ts`

**Files:**
- Modify: `libs/user/ui/src/lib/user-privacy.form.ts`
- Modify: `libs/user/feature/src/lib/user.store.ts`
- Modify: `libs/user/feature/src/lib/user-edit.modal.ts` (likely already has [i18n] for other forms; verify privacy form too)

- [ ] **Step 1: Read user-privacy.form.ts and scope.ts**

Read `libs/user/ui/src/lib/user-privacy.form.ts` (I18nService at line 86) and `libs/user/ui/src/lib/scope.ts`.

- [ ] **Step 2: Read user.store.ts**

Read `libs/user/feature/src/lib/user.store.ts` to find the USER_I18N_KEYS const.

- [ ] **Step 3: Export UserPrivacyFormI18n, apply migration pattern**

Export `UserPrivacyFormI18n` interface. Remove I18nService. Add `input.required<UserPrivacyFormI18n>()`. Update computed getters.

- [ ] **Step 4: Add keys to UserStore**

Add all form keys to USER_I18N_KEYS using `'@user/ui.'` prefix (verify with scope.ts).

- [ ] **Step 5: Verify user-edit.modal.ts passes [i18n] to bk-user-privacy-form**

Read `libs/user/feature/src/lib/user-edit.modal.ts`. Confirm or add `[i18n]="store.i18n"` for the privacy form component.

- [ ] **Step 6: Verify de.json, type-check, commit**

```bash
npx tsc --noEmit -p libs/user/ui/tsconfig.json
npx tsc --noEmit -p libs/user/feature/tsconfig.json
git add libs/user/ui/src/lib/user-privacy.form.ts \
        libs/user/feature/src/lib/user.store.ts \
        libs/user/feature/src/lib/user-edit.modal.ts
git commit -m "refactor(user): migrate user-privacy.form to duck-typing i18n input"
```

---

## Task 7: Migrate `menu.form.ts`

**Files:**
- Modify: `libs/cms/menu/ui/src/lib/menu.form.ts`
- Modify: `libs/cms/menu/feature/src/lib/menu.store.ts` (find with `find libs/cms/menu/feature/src -name "*.store.ts"`)
- Modify: `libs/cms/menu/feature/src/lib/menu.modal.ts`

- [ ] **Step 1: Read menu.form.ts (translateAll at line 139) and scope.ts**
- [ ] **Step 2: Export MenuFormI18n, apply migration pattern**
- [ ] **Step 3: Add keys to MenuStore using `'@cms/menu/ui.'` prefix**
- [ ] **Step 4: Add `[i18n]="store.i18n"` to `<bk-menu-form>` in menu.modal.ts**
- [ ] **Step 5: Verify de.json (`libs/cms/menu/ui/src/i18n/de.json`), type-check, commit**

```bash
npx tsc --noEmit -p libs/cms/menu/ui/tsconfig.json
npx tsc --noEmit -p libs/cms/menu/feature/tsconfig.json
git add libs/cms/menu/ui/src/lib/menu.form.ts libs/cms/menu/feature/src/lib/menu.store.ts libs/cms/menu/feature/src/lib/menu.modal.ts
git commit -m "refactor(cms/menu): migrate menu.form to duck-typing i18n input"
```

---

## Task 8: Migrate `page.form.ts`

**Files:**
- Modify: `libs/cms/page/ui/src/lib/page.form.ts`
- Modify: `libs/cms/page/feature/src/lib/page.store.ts`
- Modify: `libs/cms/page/feature/src/lib/page-edit.modal.ts`

**Note:** This form also has hardcoded Transloco keys in the template (e.g. `"@content.page.forms.section.label"`). Those must be moved into the `translateAll` map (and thus the interface) as part of this migration. Grep for `'@` or `"@` in the template section to find all hardcoded keys.

- [ ] **Step 1: Read page.form.ts (translateAll at line 140, I18nService at line 102). Note ALL i18n keys used in the template, including hardcoded ones.**
- [ ] **Step 2: Export PageFormI18n including keys for any hardcoded template strings**
- [ ] **Step 3: Apply migration pattern; replace hardcoded template strings with `{{ i18n().key() }}`**
- [ ] **Step 4: Add all keys to PageStore**
- [ ] **Step 5: Add `[i18n]="store.i18n"` to `<bk-page-form>` in page-edit.modal.ts**
- [ ] **Step 6: Verify de.json (`libs/cms/page/ui/src/i18n/de.json`), type-check, commit**

```bash
npx tsc --noEmit -p libs/cms/page/ui/tsconfig.json
npx tsc --noEmit -p libs/cms/page/feature/tsconfig.json
git add libs/cms/page/ui/src/lib/page.form.ts libs/cms/page/feature/src/lib/page.store.ts libs/cms/page/feature/src/lib/page-edit.modal.ts
git commit -m "refactor(cms/page): migrate page.form to duck-typing i18n input"
```

---

## Task 9: Migrate `section.form.ts`

**Files:**
- Modify: `libs/cms/section/ui/src/lib/section.form.ts`
- Modify: `libs/cms/section/feature/src/lib/section.store.ts`
- Modify: `libs/cms/section/feature/src/lib/section-edit.modal.ts`

- [ ] **Step 1: Read section.form.ts (translateAll at line 199) and scope.ts**
- [ ] **Step 2: Export SectionFormI18n, apply migration pattern**
- [ ] **Step 3: Add keys to SectionStore**
- [ ] **Step 4: Add `[i18n]="store.i18n"` to `<bk-section-form>` in section-edit.modal.ts**
- [ ] **Step 5: Verify de.json (`libs/cms/section/ui/src/i18n/de.json`), type-check, commit**

```bash
npx tsc --noEmit -p libs/cms/section/ui/tsconfig.json
npx tsc --noEmit -p libs/cms/section/feature/tsconfig.json
git add libs/cms/section/ui/src/lib/section.form.ts libs/cms/section/feature/src/lib/section.store.ts libs/cms/section/feature/src/lib/section-edit.modal.ts
git commit -m "refactor(cms/section): migrate section.form to duck-typing i18n input"
```

---

## Task 10: Migrate `account.form.ts`

**Files:**
- Modify: `libs/finance/account/ui/src/lib/account.form.ts`
- Modify: `libs/finance/account/feature/src/lib/account.store.ts`
- Modify: `libs/finance/account/feature/src/lib/account-edit.modal.ts`

- [ ] **Step 1: Read account.form.ts (translateAll at line 81) and scope.ts**
- [ ] **Step 2: Export AccountFormI18n, apply migration pattern**
- [ ] **Step 3: Add keys to AccountStore**
- [ ] **Step 4: Add `[i18n]="store.i18n"` to `<bk-account-form>` in account-edit.modal.ts**
- [ ] **Step 5: Verify de.json (`libs/finance/account/ui/src/i18n/de.json`), type-check, commit**

```bash
npx tsc --noEmit -p libs/finance/account/ui/tsconfig.json
npx tsc --noEmit -p libs/finance/account/feature/tsconfig.json
git add libs/finance/account/ui/src/lib/account.form.ts libs/finance/account/feature/src/lib/account.store.ts libs/finance/account/feature/src/lib/account-edit.modal.ts
git commit -m "refactor(finance/account): migrate account.form to duck-typing i18n input"
```

---

## Task 11: Migrate `invoice-edit.form.ts` and `bexio-invoice-new.form.ts`

**Files:**
- Modify: `libs/finance/invoice/ui/src/lib/invoice-edit.form.ts`
- Modify: `libs/finance/invoice/ui/src/lib/bexio-invoice-new.form.ts`
- Modify: `libs/finance/invoice/feature/src/lib/invoice.store.ts` (or locate with `find libs/finance/invoice/feature/src -name "*.store.ts"`)
- Modify: `libs/finance/invoice/feature/src/lib/invoice-edit.modal.ts`
- Modify: `libs/finance/invoice/feature/src/lib/invoice-new.modal.ts`

**Note:** `bexio-invoice-new.form.ts` has hardcoded title keys in the template. Grep the template for `'@` or `"@` and include those keys in the interface.

- [ ] **Step 1: Read both form files (invoice-edit line 104, bexio-invoice-new line 160) and scope.ts**
- [ ] **Step 2: Export InvoiceEditFormI18n and BexioInvoiceNewFormI18n. For bexio form, include any hardcoded template keys.**
- [ ] **Step 3: Apply migration to both forms; replace hardcoded template strings in bexio form**
- [ ] **Step 4: Find the invoice feature store and add all keys from both forms**
- [ ] **Step 5: Add `[i18n]="store.i18n"` to both form usages in their respective modals**
- [ ] **Step 6: Verify de.json (`libs/finance/invoice/ui/src/i18n/de.json`), type-check, commit**

```bash
npx tsc --noEmit -p libs/finance/invoice/ui/tsconfig.json
npx tsc --noEmit -p libs/finance/invoice/feature/tsconfig.json
git add libs/finance/invoice/ui/src/lib/invoice-edit.form.ts \
        libs/finance/invoice/ui/src/lib/bexio-invoice-new.form.ts
git commit -m "refactor(finance/invoice): migrate invoice forms to duck-typing i18n input"
```

---

## Task 12: Migrate `location.form.ts`

**Files:**
- Modify: `libs/geo/location/ui/src/lib/location.form.ts`
- Modify: `libs/geo/location/feature/src/lib/location.store.ts`
- Modify: `libs/geo/location/feature/src/lib/location-edit.modal.ts`

- [ ] **Step 1: Read location.form.ts (I18nService at line 97, translateAll at line 140) and scope.ts**
- [ ] **Step 2: Export LocationFormI18n, apply migration pattern**
- [ ] **Step 3: Add keys to LocationStore**
- [ ] **Step 4: Add `[i18n]="store.i18n"` to `<bk-location-form>` in location-edit.modal.ts**
- [ ] **Step 5: Verify de.json (`libs/geo/location/ui/src/i18n/de.json`), type-check, commit**

```bash
npx tsc --noEmit -p libs/geo/location/ui/tsconfig.json
npx tsc --noEmit -p libs/geo/location/feature/tsconfig.json
git add libs/geo/location/ui/src/lib/location.form.ts libs/geo/location/feature/src/lib/location.store.ts libs/geo/location/feature/src/lib/location-edit.modal.ts
git commit -m "refactor(geo/location): migrate location.form to duck-typing i18n input"
```

---

## Task 13: Migrate membership forms (4 files)

**Files:**
- Modify: `libs/relationship/membership/ui/src/lib/category-change.form.ts`
- Modify: `libs/relationship/membership/ui/src/lib/member-new.form.ts`
- Modify: `libs/relationship/membership/ui/src/lib/membership.form.ts`
- Modify: `libs/relationship/membership/ui/src/lib/scs-member-fee-edit.form.ts`
- Modify: `libs/relationship/membership/feature/src/lib/membership.store.ts`
- Modify: `libs/relationship/membership/feature/src/lib/membership-category-change.modal.ts`
- Modify: `libs/relationship/membership/feature/src/lib/member-new.modal.ts`
- Modify: `libs/relationship/membership/feature/src/lib/membership-edit.modal.ts`
- Modify: `libs/relationship/membership/feature/src/lib/scs-member-fee-edit.modal.ts`

- [ ] **Step 1: Read all 4 form files and scope.ts**

Read each form file to extract translateAll key maps:
- `category-change.form.ts` (translateAll at line 81)
- `member-new.form.ts` (translateAll at line 259)
- `membership.form.ts` (translateAll at line 195)
- `scs-member-fee-edit.form.ts` (translateAll at line 110)
- `libs/relationship/membership/ui/src/lib/scope.ts` (for PFX)

- [ ] **Step 2: Export interfaces for all 4 forms**

Above each `@Component`:
- `CategoryChangeFormI18n`
- `MemberNewFormI18n`
- `MembershipFormI18n`
- `ScsMemberFeeEditFormI18n`

- [ ] **Step 3: Apply migration pattern to all 4 forms**

For each: remove I18nService injection, add `input.required<XxxFormI18n>()`, update computed getters.

- [ ] **Step 4: Read membership.store.ts and add all keys**

Read `libs/relationship/membership/feature/src/lib/membership.store.ts`. Add keys from all 4 forms to the store's KEYS const using the `'@relationship/membership/ui.'` prefix (verify with scope.ts).

- [ ] **Step 5: Update all 4 parent modals**

For each modal, find the form component selector and add `[i18n]="store.i18n"`:
- `membership-category-change.modal.ts` → `<bk-category-change-form>`
- `member-new.modal.ts` → `<bk-member-new-form>`
- `membership-edit.modal.ts` → `<bk-membership-form>`
- `scs-member-fee-edit.modal.ts` → `<bk-scs-member-fee-edit-form>`

- [ ] **Step 6: Verify de.json (`libs/relationship/membership/ui/src/i18n/de.json`), type-check, commit**

```bash
npx tsc --noEmit -p libs/relationship/membership/ui/tsconfig.json
npx tsc --noEmit -p libs/relationship/membership/feature/tsconfig.json
git add libs/relationship/membership/ui/src/lib/category-change.form.ts \
        libs/relationship/membership/ui/src/lib/member-new.form.ts \
        libs/relationship/membership/ui/src/lib/membership.form.ts \
        libs/relationship/membership/ui/src/lib/scs-member-fee-edit.form.ts \
        libs/relationship/membership/feature/src/lib/membership.store.ts
git commit -m "refactor(relationship/membership): migrate membership forms to duck-typing i18n input"
```

---

## Task 14: Migrate `personal-rel.form.ts`

**Files:**
- Modify: `libs/relationship/personal-rel/ui/src/lib/personal-rel.form.ts`
- Modify: `libs/relationship/personal-rel/feature/src/lib/personal-rel.store.ts`
- Modify: `libs/relationship/personal-rel/feature/src/lib/personal-rel-edit.modal.ts`

- [ ] **Step 1: Read personal-rel.form.ts (translateAll at line 129) and scope.ts**
- [ ] **Step 2: Export PersonalRelFormI18n, apply migration pattern**
- [ ] **Step 3: Add keys to PersonalRelStore**
- [ ] **Step 4: Add `[i18n]="store.i18n"` to `<bk-personal-rel-form>` in personal-rel-edit.modal.ts**
- [ ] **Step 5: Verify de.json (`libs/relationship/personal-rel/ui/src/i18n/de.json`), type-check, commit**

```bash
npx tsc --noEmit -p libs/relationship/personal-rel/ui/tsconfig.json
npx tsc --noEmit -p libs/relationship/personal-rel/feature/tsconfig.json
git add libs/relationship/personal-rel/ui/src/lib/personal-rel.form.ts \
        libs/relationship/personal-rel/feature/src/lib/personal-rel.store.ts \
        libs/relationship/personal-rel/feature/src/lib/personal-rel-edit.modal.ts
git commit -m "refactor(relationship/personal-rel): migrate personal-rel.form to duck-typing i18n input"
```

---

## Task 15: Migrate `reservation.form.ts` and `reservation-apply.form.ts`

**Files:**
- Modify: `libs/relationship/reservation/ui/src/lib/reservation.form.ts`
- Modify: `libs/relationship/reservation/ui/src/lib/reservation-apply.form.ts`
- Modify: `libs/relationship/reservation/feature/src/lib/reservation.store.ts`
- Modify: `libs/relationship/reservation/feature/src/lib/reservation-edit.modal.ts`
- Modify: parent modal for reservation-apply form (find with `grep -rn "bk-reservation-apply-form" libs/relationship/reservation/feature/src`)

- [ ] **Step 1: Read both form files (reservation.form at line 223, reservation-apply.form at line 190) and scope.ts**
- [ ] **Step 2: Export ReservationFormI18n and ReservationApplyFormI18n, apply migration pattern to both**
- [ ] **Step 3: Add all keys from both forms to ReservationStore**
- [ ] **Step 4: Update both parent modals with `[i18n]="store.i18n"`**
- [ ] **Step 5: Verify de.json (`libs/relationship/reservation/ui/src/i18n/de.json`), type-check, commit**

```bash
npx tsc --noEmit -p libs/relationship/reservation/ui/tsconfig.json
npx tsc --noEmit -p libs/relationship/reservation/feature/tsconfig.json
git add libs/relationship/reservation/ui/src/lib/reservation.form.ts \
        libs/relationship/reservation/ui/src/lib/reservation-apply.form.ts \
        libs/relationship/reservation/feature/src/lib/reservation.store.ts
git commit -m "refactor(relationship/reservation): migrate reservation forms to duck-typing i18n input"
```

---

## Task 16: Migrate `responsibility.form.ts`

**Files:**
- Modify: `libs/relationship/responsibility/ui/src/lib/responsibility.form.ts`
- Modify: `libs/relationship/responsibility/feature/src/lib/responsibility.store.ts`
- Modify: `libs/relationship/responsibility/feature/src/lib/responsibility-edit.modal.ts`

- [ ] **Step 1: Read responsibility.form.ts (translateAll at line 136) and scope.ts**
- [ ] **Step 2: Export ResponsibilityFormI18n, apply migration pattern**
- [ ] **Step 3: Add keys to ResponsibilityStore**
- [ ] **Step 4: Add `[i18n]="store.i18n"` in responsibility-edit.modal.ts**
- [ ] **Step 5: Verify de.json, type-check, commit**

```bash
npx tsc --noEmit -p libs/relationship/responsibility/ui/tsconfig.json
npx tsc --noEmit -p libs/relationship/responsibility/feature/tsconfig.json
git add libs/relationship/responsibility/ui/src/lib/responsibility.form.ts \
        libs/relationship/responsibility/feature/src/lib/responsibility.store.ts \
        libs/relationship/responsibility/feature/src/lib/responsibility-edit.modal.ts
git commit -m "refactor(relationship/responsibility): migrate responsibility.form to duck-typing i18n input"
```

---

## Task 17: Migrate `transfer.form.ts`

**Files:**
- Modify: `libs/relationship/transfer/ui/src/lib/transfer.form.ts`
- Modify: `libs/relationship/transfer/feature/src/lib/transfer.store.ts`
- Modify: `libs/relationship/transfer/feature/src/lib/transfer-edit.modal.ts`

**Note:** transfer.form.ts has hardcoded Transloco keys in the template (e.g. `"@transfer.field.subjects"`). Include those keys in the interface and replace template literals with signal bindings.

- [ ] **Step 1: Read transfer.form.ts (translateAll at line 191) and template for hardcoded keys. Read scope.ts.**
- [ ] **Step 2: Export TransferFormI18n including hardcoded template keys, apply migration pattern and replace hardcoded keys**
- [ ] **Step 3: Add all keys to TransferStore**
- [ ] **Step 4: Add `[i18n]="store.i18n"` in transfer-edit.modal.ts**
- [ ] **Step 5: Verify de.json (`libs/relationship/transfer/ui/src/i18n/de.json`), type-check, commit**

```bash
npx tsc --noEmit -p libs/relationship/transfer/ui/tsconfig.json
npx tsc --noEmit -p libs/relationship/transfer/feature/tsconfig.json
git add libs/relationship/transfer/ui/src/lib/transfer.form.ts \
        libs/relationship/transfer/feature/src/lib/transfer.store.ts \
        libs/relationship/transfer/feature/src/lib/transfer-edit.modal.ts
git commit -m "refactor(relationship/transfer): migrate transfer.form to duck-typing i18n input"
```

---

## Task 18: Migrate `workrel.form.ts`

**Files:**
- Modify: `libs/relationship/workrel/ui/src/lib/workrel.form.ts`
- Modify: `libs/relationship/workrel/feature/src/lib/workrel.store.ts`
- Modify: `libs/relationship/workrel/feature/src/lib/workrel-edit.modal.ts`

- [ ] **Step 1: Read workrel.form.ts (translateAll at line 176) and scope.ts**
- [ ] **Step 2: Export WorkrelFormI18n, apply migration pattern**
- [ ] **Step 3: Add keys to WorkrelStore**
- [ ] **Step 4: Add `[i18n]="store.i18n"` in workrel-edit.modal.ts**
- [ ] **Step 5: Verify de.json (`libs/relationship/workrel/ui/src/i18n/de.json`), type-check, commit**

```bash
npx tsc --noEmit -p libs/relationship/workrel/ui/tsconfig.json
npx tsc --noEmit -p libs/relationship/workrel/feature/tsconfig.json
git add libs/relationship/workrel/ui/src/lib/workrel.form.ts \
        libs/relationship/workrel/feature/src/lib/workrel.store.ts \
        libs/relationship/workrel/feature/src/lib/workrel-edit.modal.ts
git commit -m "refactor(relationship/workrel): migrate workrel.form to duck-typing i18n input"
```

---

## Task 19: Migrate `invitation.form.ts`

**Files:**
- Modify: `libs/relationship/invitation/ui/src/lib/invitation.form.ts`
- Modify: `libs/relationship/invitation/feature/src/lib/invitation.store.ts`
- Modify: `libs/relationship/invitation/feature/src/lib/invitation-edit.modal.ts`

- [ ] **Step 1: Read invitation.form.ts (translateAll at line 124) and scope.ts**
- [ ] **Step 2: Export InvitationFormI18n, apply migration pattern**
- [ ] **Step 3: Find invitation store (`find libs/relationship/invitation/feature/src -name "*.store.ts"`) and add keys**
- [ ] **Step 4: Add `[i18n]="store.i18n"` in invitation-edit.modal.ts**
- [ ] **Step 5: Verify de.json (`libs/relationship/invitation/ui/src/i18n/de.json`), type-check, commit**

```bash
npx tsc --noEmit -p libs/relationship/invitation/ui/tsconfig.json
npx tsc --noEmit -p libs/relationship/invitation/feature/tsconfig.json
git add libs/relationship/invitation/ui/src/lib/invitation.form.ts \
        libs/relationship/invitation/feature/src/lib/invitation.store.ts \
        libs/relationship/invitation/feature/src/lib/invitation-edit.modal.ts
git commit -m "refactor(relationship/invitation): migrate invitation.form to duck-typing i18n input"
```

---

## Task 20: Fix hardcoded template keys in Pattern A forms

These forms already use `input.required<XyzFormI18n>()` but have hardcoded Transloco keys directly in the template (passed to child components as `string` attributes). These keys must be added to the form's existing interface and passed as signals.

**Forms:**
- `libs/calevent/ui/src/lib/calevent.form.ts`
- `libs/chat/ui/src/lib/poll-create.form.ts`

- [ ] **Step 1: Read calevent.form.ts**

Grep for hardcoded keys in the template:
```bash
grep -n '"@\|'"'"'@' libs/calevent/ui/src/lib/calevent.form.ts
```

Note every hardcoded `'@...'` key string in the template (e.g. passed as `addLabel="@calevent.field.responsible.addLabel"`).

- [ ] **Step 2: Identify the parent store and where calevent.form.ts gets its i18n**

```bash
grep -rn "bk-calevent-form\|CaleventForm" libs/calevent/feature/src --include="*.ts" | head -10
```

Find which store's KEYS const needs the new keys.

- [ ] **Step 3: Extend CaleventFormI18n with the hardcoded keys**

In `calevent.form.ts`, add one `Signal<string>` per hardcoded key to the existing `CaleventFormI18n` interface.

- [ ] **Step 4: Update the calevent feature store**

Add the new keys to the store's KEYS const. Transloco paths: the hardcoded `'@calevent.field.responsible.addLabel'` maps to `'@calevent.field.responsible.addLabel'` (already a full absolute key).

- [ ] **Step 5: Replace hardcoded template strings in calevent.form.ts**

For each hardcoded key attribute like `addLabel="@calevent.field.responsible.addLabel"`, change it to a signal binding: `[addLabel]="i18n().responsible_addLabel()"`. 

- [ ] **Step 6: Apply same process to poll-create.form.ts**

```bash
grep -n '"@\|'"'"'@' libs/chat/ui/src/lib/poll-create.form.ts
grep -rn "bk-poll-create-form\|PollCreateForm" libs/chat/feature/src --include="*.ts" | head -10
```

Extend `PollCreateFormI18n`, add keys to the chat store, replace hardcoded template strings.

- [ ] **Step 7: Verify de.json for both domains, type-check, commit**

```bash
npx tsc --noEmit -p libs/calevent/ui/tsconfig.json
npx tsc --noEmit -p libs/calevent/feature/tsconfig.json
npx tsc --noEmit -p libs/chat/ui/tsconfig.json
npx tsc --noEmit -p libs/chat/feature/tsconfig.json
git add libs/calevent/ui/src/lib/calevent.form.ts \
        libs/chat/ui/src/lib/poll-create.form.ts
git commit -m "fix(forms): replace hardcoded template i18n keys in calevent and poll-create forms"
```

---

## Task 21: Final — Verify de.json completeness for all form namespaces

After all migrations, do a systematic check that every key used in every form (now in the parent store's KEYS const) has a German translation in the corresponding de.json file.

- [ ] **Step 1: Collect all ui-layer i18n namespaces touched by this migration**

These are the Transloco namespace prefixes (one de.json file per namespace):
- `@subject/person/ui` → `libs/subject/person/ui/src/i18n/de.json`
- `@subject/org/ui` → `libs/subject/org/ui/src/i18n/de.json`
- `@subject/group/ui` → `libs/subject/group/ui/src/i18n/de.json`
- `@subject/address/ui` → `libs/subject/address/ui/src/i18n/de.json`
- `@user/ui` → `libs/user/ui/src/i18n/de.json`
- `@cms/menu/ui` → `libs/cms/menu/ui/src/i18n/de.json`
- `@cms/page/ui` → `libs/cms/page/ui/src/i18n/de.json`
- `@cms/section/ui` → `libs/cms/section/ui/src/i18n/de.json`
- `@finance/account/ui` → `libs/finance/account/ui/src/i18n/de.json`
- `@finance/invoice/ui` → `libs/finance/invoice/ui/src/i18n/de.json`
- `@geo/location/ui` → `libs/geo/location/ui/src/i18n/de.json`
- `@relationship/invitation/ui` → `libs/relationship/invitation/ui/src/i18n/de.json`
- `@relationship/membership/ui` → `libs/relationship/membership/ui/src/i18n/de.json`
- `@relationship/personal-rel/ui` → `libs/relationship/personal-rel/ui/src/i18n/de.json`
- `@relationship/reservation/ui` → `libs/relationship/reservation/ui/src/i18n/de.json`
- `@relationship/responsibility/ui` → `libs/relationship/responsibility/ui/src/i18n/de.json`
- `@relationship/transfer/ui` → `libs/relationship/transfer/ui/src/i18n/de.json`
- `@relationship/workrel/ui` → `libs/relationship/workrel/ui/src/i18n/de.json`
- `@calevent/ui` → `libs/calevent/ui/src/i18n/de.json`
- `@chat/ui` → `libs/chat/ui/src/i18n/de.json`

- [ ] **Step 2: For each namespace, cross-reference keys with de.json**

For each domain, read the de.json and the store's KEYS const for that domain. Every `'@namespace.a.b.c'` key must resolve to a path `a.b.c` in the de.json file. Add any missing German translations.

Example: key `'@subject/person/ui.bkey.label'` → look for `{ "bkey": { "label": "..." } }` in `libs/subject/person/ui/src/i18n/de.json`.

- [ ] **Step 3: Commit any de.json additions**

```bash
git add libs/**/ui/src/i18n/de.json
git commit -m "i18n(de): add missing translation keys for migrated form i18n interfaces"
```

- [ ] **Step 4: Full type-check across all modified libs**

```bash
npx tsc --noEmit -p libs/subject/person/ui/tsconfig.json
npx tsc --noEmit -p libs/subject/org/ui/tsconfig.json
npx tsc --noEmit -p libs/subject/group/ui/tsconfig.json
npx tsc --noEmit -p libs/subject/address/ui/tsconfig.json
npx tsc --noEmit -p libs/user/ui/tsconfig.json
npx tsc --noEmit -p libs/cms/menu/ui/tsconfig.json
npx tsc --noEmit -p libs/cms/page/ui/tsconfig.json
npx tsc --noEmit -p libs/cms/section/ui/tsconfig.json
npx tsc --noEmit -p libs/finance/account/ui/tsconfig.json
npx tsc --noEmit -p libs/finance/invoice/ui/tsconfig.json
npx tsc --noEmit -p libs/geo/location/ui/tsconfig.json
npx tsc --noEmit -p libs/relationship/invitation/ui/tsconfig.json
npx tsc --noEmit -p libs/relationship/membership/ui/tsconfig.json
npx tsc --noEmit -p libs/relationship/personal-rel/ui/tsconfig.json
npx tsc --noEmit -p libs/relationship/reservation/ui/tsconfig.json
npx tsc --noEmit -p libs/relationship/responsibility/ui/tsconfig.json
npx tsc --noEmit -p libs/relationship/transfer/ui/tsconfig.json
npx tsc --noEmit -p libs/relationship/workrel/ui/tsconfig.json
```

All must pass with zero errors. Any remaining errors indicate a key mismatch between the interface and the store's KEYS const — fix before declaring done.

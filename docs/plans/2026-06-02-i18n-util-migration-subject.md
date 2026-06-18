# i18n Util Migration — Subject Domains Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move `FEATURE_I18N_KEYS` + `FeatureI18n` type from each feature store into a new `<domain>-i18n.ts` in the util layer, then replace duck-typed form interfaces with the full `FeatureI18n` type, for all five `subject/*` domains.

**Architecture:** Each task creates a `<domain>-i18n.ts` in the existing util lib, exports it from `index.ts`, strips the local definition from the store (importing from util instead), then updates each form to use the full `FeatureI18n` input type instead of a local duck-typed subset interface. The key names in the store and the duck-typed form interfaces already match, so no template changes are needed.

**Tech Stack:** Angular 20, TypeScript strict, NgRx Signal Stores, Nx monorepo, pnpm.

---

## Background: the pattern

The reference implementation is `libs/cms/section/util/src/lib/section-i18n.ts` (already done).

```ts
// <domain>-i18n.ts in util
import { Signal } from '@angular/core';

const PFX = '<prefix-string>';   // same value as feature/src/lib/scope.ts

export const FEATURE_I18N_KEYS = {
  // ... all keys copied from the store, `const` → `export const`
} satisfies Record<string, string>;

export type FeatureI18n = { [K in keyof typeof FEATURE_I18N_KEYS]: Signal<string> };
```

Store change:
```ts
// remove local const FEATURE_I18N_KEYS and export type FeatureI18n
// add to existing import from util:
import { ..., FEATURE_I18N_KEYS, FeatureI18n } from '@bk2/<domain>-util';
```

Form change — remove the local duck-typed interface and switch input type:
```ts
// BEFORE
export interface PersonFormI18n { bkey_label: Signal<string>; ... }
public readonly i18n = input.required<PersonFormI18n>();

// AFTER
import { PersonI18n } from '@bk2/subject-person-util';
public readonly i18n = input.required<PersonI18n>();
```

No template changes needed — key names in the form interfaces already match the store's key names exactly.

---

## File Map

| Action | File |
|--------|------|
| Create | `libs/subject/person/util/src/lib/person-i18n.ts` |
| Modify | `libs/subject/person/util/src/index.ts` |
| Modify | `libs/subject/person/feature/src/lib/person.store.ts` |
| Modify | `libs/subject/person/ui/src/lib/person.form.ts` |
| Modify | `libs/subject/person/ui/src/lib/person-new.form.ts` |
| Create | `libs/subject/group/util/src/lib/group-i18n.ts` |
| Modify | `libs/subject/group/util/src/index.ts` |
| Modify | `libs/subject/group/feature/src/lib/group.store.ts` |
| Modify | `libs/subject/group/ui/src/lib/group.form.ts` |
| Create | `libs/subject/org/util/src/lib/org-i18n.ts` |
| Modify | `libs/subject/org/util/src/index.ts` |
| Modify | `libs/subject/org/feature/src/lib/org.store.ts` |
| Modify | `libs/subject/org/ui/src/lib/org.form.ts` |
| Modify | `libs/subject/org/ui/src/lib/org-new.form.ts` |
| Create | `libs/subject/address/util/src/lib/address-i18n.ts` |
| Modify | `libs/subject/address/util/src/index.ts` |
| Modify | `libs/subject/address/feature/src/lib/addresses.store.ts` |
| Modify | `libs/subject/address/ui/src/lib/address.form.ts` |
| Create | `libs/subject/application/util/src/lib/application-i18n.ts` |
| Modify | `libs/subject/application/util/src/index.ts` |
| Modify | `libs/subject/application/feature/src/lib/application.store.ts` |
| Modify | `libs/subject/application/ui/src/lib/application.form.ts` |

---

### Task 1: person domain

**Files:**
- Create: `libs/subject/person/util/src/lib/person-i18n.ts`
- Modify: `libs/subject/person/util/src/index.ts`
- Modify: `libs/subject/person/feature/src/lib/person.store.ts` (lines 49–143)
- Modify: `libs/subject/person/ui/src/lib/person.form.ts` (lines 14–38 + input type)
- Modify: `libs/subject/person/ui/src/lib/person-new.form.ts` (duck-typed interface + input type)

**Prefix:** `'@subject/person/feature.'` (from `libs/subject/person/feature/src/lib/scope.ts`)

- [ ] **Step 1: Create person-i18n.ts**

Create `libs/subject/person/util/src/lib/person-i18n.ts`:

```ts
import { Signal } from '@angular/core';

const PFX = '@subject/person/feature.';

export const PERSON_I18N_KEYS = {
  // Copy the full const body from person.store.ts lines 49–141
  // Change `const PERSON_I18N_KEYS = {` to `export const PERSON_I18N_KEYS = {`
  // The PFX variable resolves to '@subject/person/feature.' — use it as-is
} satisfies Record<string, string>;

export type PersonI18n = { [K in keyof typeof PERSON_I18N_KEYS]: Signal<string> };
```

**Exact copy instruction:** open `libs/subject/person/feature/src/lib/person.store.ts`, copy lines 49–141 (the full `const PERSON_I18N_KEYS = { ... } satisfies Record<string, string>;` block). In the new file: change `const` to `export const`. The `PFX` reference is resolved by the local `const PFX` defined above.

- [ ] **Step 2: Add export to barrel**

In `libs/subject/person/util/src/index.ts`, add at the end:
```ts
export * from './lib/person-i18n';
```

- [ ] **Step 3: Update person.store.ts**

In `libs/subject/person/feature/src/lib/person.store.ts`:

a) Delete lines 49–143 (the `const PERSON_I18N_KEYS` block + `export type PersonI18n` line).

b) Find the existing import from `@bk2/subject-person-util` and add `PERSON_I18N_KEYS` and `PersonI18n`:
```ts
import { ..., PERSON_I18N_KEYS, PersonI18n } from '@bk2/subject-person-util';
```

c) If `PFX` is no longer used anywhere in the file after deletion, also remove `import { PFX } from './scope';`.

- [ ] **Step 4: Update person.form.ts**

In `libs/subject/person/ui/src/lib/person.form.ts`:

a) Delete the `export interface PersonFormI18n { ... }` block (lines 14–38).

b) Add import at the top:
```ts
import { PersonI18n } from '@bk2/subject-person-util';
```

c) Find the line `public readonly i18n = input.required<PersonFormI18n>();` and change to:
```ts
public readonly i18n = input.required<PersonI18n>();
```

d) Check if `Signal` is still used elsewhere in the file. If not, remove it from the `@angular/core` import.

- [ ] **Step 5: Update person-new.form.ts**

In `libs/subject/person/ui/src/lib/person-new.form.ts`:

a) Delete the `export interface PersonNewFormI18n { ... }` block.

b) Add import:
```ts
import { PersonI18n } from '@bk2/subject-person-util';
```

c) Change the input type from `PersonNewFormI18n` to `PersonI18n`:
```ts
public readonly i18n = input.required<PersonI18n>();
```

d) Check if `Signal` is still needed in the `@angular/core` import — remove if unused.

- [ ] **Step 6: Type-check**

```bash
npx tsc --noEmit -p libs/subject/person/util/tsconfig.json 2>&1 | grep -v "^$"
npx tsc --noEmit -p libs/subject/person/feature/tsconfig.json 2>&1 | grep -v "^$"
npx tsc --noEmit -p libs/subject/person/ui/tsconfig.json 2>&1 | grep -v "^$"
```

Expected: no new errors (pre-existing errors in other files are acceptable).

- [ ] **Step 7: Commit**

```bash
git add \
  libs/subject/person/util/src/lib/person-i18n.ts \
  libs/subject/person/util/src/index.ts \
  libs/subject/person/feature/src/lib/person.store.ts \
  libs/subject/person/ui/src/lib/person.form.ts \
  libs/subject/person/ui/src/lib/person-new.form.ts
git commit -m "refactor(person): move PERSON_I18N_KEYS and PersonI18n to util layer

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 2: group domain

**Files:**
- Create: `libs/subject/group/util/src/lib/group-i18n.ts`
- Modify: `libs/subject/group/util/src/index.ts`
- Modify: `libs/subject/group/feature/src/lib/group.store.ts` (lines 39–122)
- Modify: `libs/subject/group/ui/src/lib/group.form.ts` (duck-typed interface + input type)

**Prefix:** `'@subject/group/feature.'` (from `libs/subject/group/feature/src/lib/scope.ts`)

- [ ] **Step 1: Create group-i18n.ts**

Create `libs/subject/group/util/src/lib/group-i18n.ts`:

```ts
import { Signal } from '@angular/core';

const PFX = '@subject/group/feature.';

export const GROUP_I18N_KEYS = {
  // Copy lines 39–121 from group.store.ts (const body)
  // Change `const` to `export const`
} satisfies Record<string, string>;

export type GroupI18n = { [K in keyof typeof GROUP_I18N_KEYS]: Signal<string> };
```

**Exact copy instruction:** open `libs/subject/group/feature/src/lib/group.store.ts`, copy lines 39–121 (the full `GROUP_I18N_KEYS` block). Change `const` to `export const` in the new file.

- [ ] **Step 2: Add export to barrel**

In `libs/subject/group/util/src/index.ts`, add at the end:
```ts
export * from './lib/group-i18n';
```

- [ ] **Step 3: Update group.store.ts**

a) Delete lines 39–122 (the `GROUP_I18N_KEYS` block + `export type GroupI18n` line).

b) Find the existing import from `@bk2/subject-group-util` and add the new exports:
```ts
import { ..., GROUP_I18N_KEYS, GroupI18n } from '@bk2/subject-group-util';
```

c) Remove `import { PFX } from './scope';` if PFX is no longer used in the file.

- [ ] **Step 4: Update group.form.ts**

In `libs/subject/group/ui/src/lib/group.form.ts`:

a) Delete the `export interface GroupFormI18n { ... }` block.

b) Add import:
```ts
import { GroupI18n } from '@bk2/subject-group-util';
```

c) Change the input type:
```ts
public readonly i18n = input.required<GroupI18n>();
```

d) Remove `Signal` from `@angular/core` import if no longer used.

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit -p libs/subject/group/util/tsconfig.json 2>&1 | grep -v "^$"
npx tsc --noEmit -p libs/subject/group/feature/tsconfig.json 2>&1 | grep -v "^$"
npx tsc --noEmit -p libs/subject/group/ui/tsconfig.json 2>&1 | grep -v "^$"
```

- [ ] **Step 6: Commit**

```bash
git add \
  libs/subject/group/util/src/lib/group-i18n.ts \
  libs/subject/group/util/src/index.ts \
  libs/subject/group/feature/src/lib/group.store.ts \
  libs/subject/group/ui/src/lib/group.form.ts
git commit -m "refactor(group): move GROUP_I18N_KEYS and GroupI18n to util layer

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 3: org domain

**Files:**
- Create: `libs/subject/org/util/src/lib/org-i18n.ts`
- Modify: `libs/subject/org/util/src/index.ts`
- Modify: `libs/subject/org/feature/src/lib/org.store.ts` (lines 39–101)
- Modify: `libs/subject/org/ui/src/lib/org.form.ts` (duck-typed interface + input type)
- Modify: `libs/subject/org/ui/src/lib/org-new.form.ts` (duck-typed interface + input type)

**Prefix:** `'@subject/org/feature.'` (from `libs/subject/org/feature/src/lib/scope.ts`)

- [ ] **Step 1: Create org-i18n.ts**

Create `libs/subject/org/util/src/lib/org-i18n.ts`:

```ts
import { Signal } from '@angular/core';

const PFX = '@subject/org/feature.';

export const ORG_I18N_KEYS = {
  // Copy lines 39–100 from org.store.ts (const body)
  // Change `const` to `export const`
} satisfies Record<string, string>;

export type OrgI18n = { [K in keyof typeof ORG_I18N_KEYS]: Signal<string> };
```

**Exact copy instruction:** open `libs/subject/org/feature/src/lib/org.store.ts`, copy lines 39–100. Change `const` to `export const` in the new file.

- [ ] **Step 2: Add export to barrel**

In `libs/subject/org/util/src/index.ts`, add at the end:
```ts
export * from './lib/org-i18n';
```

- [ ] **Step 3: Update org.store.ts**

a) Delete lines 39–101 (the `ORG_I18N_KEYS` block + `export type OrgI18n` line).

b) Find the existing import from `@bk2/subject-org-util` and add:
```ts
import { ..., ORG_I18N_KEYS, OrgI18n } from '@bk2/subject-org-util';
```

c) Remove `import { PFX } from './scope';` if PFX is no longer used.

- [ ] **Step 4: Update org.form.ts**

In `libs/subject/org/ui/src/lib/org.form.ts`:

a) Delete the `export interface OrgFormI18n { ... }` block.

b) Add import:
```ts
import { OrgI18n } from '@bk2/subject-org-util';
```

c) Change input type:
```ts
public readonly i18n = input.required<OrgI18n>();
```

d) Remove `Signal` from `@angular/core` import if unused.

- [ ] **Step 5: Update org-new.form.ts**

In `libs/subject/org/ui/src/lib/org-new.form.ts`:

a) Delete the `export interface OrgNewFormI18n { ... }` block (check if it exists — if the file already uses `OrgI18n`, skip).

b) Add import:
```ts
import { OrgI18n } from '@bk2/subject-org-util';
```

c) Change input type from `OrgNewFormI18n` (or current type) to:
```ts
public readonly i18n = input.required<OrgI18n>();
```

d) Remove `Signal` from `@angular/core` import if unused.

- [ ] **Step 6: Type-check**

```bash
npx tsc --noEmit -p libs/subject/org/util/tsconfig.json 2>&1 | grep -v "^$"
npx tsc --noEmit -p libs/subject/org/feature/tsconfig.json 2>&1 | grep -v "^$"
npx tsc --noEmit -p libs/subject/org/ui/tsconfig.json 2>&1 | grep -v "^$"
```

- [ ] **Step 7: Commit**

```bash
git add \
  libs/subject/org/util/src/lib/org-i18n.ts \
  libs/subject/org/util/src/index.ts \
  libs/subject/org/feature/src/lib/org.store.ts \
  libs/subject/org/ui/src/lib/org.form.ts \
  libs/subject/org/ui/src/lib/org-new.form.ts
git commit -m "refactor(org): move ORG_I18N_KEYS and OrgI18n to util layer

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 4: address domain

**Files:**
- Create: `libs/subject/address/util/src/lib/address-i18n.ts`
- Modify: `libs/subject/address/util/src/index.ts`
- Modify: `libs/subject/address/feature/src/lib/addresses.store.ts` (lines 52–258)
- Modify: `libs/subject/address/ui/src/lib/address.form.ts` (duck-typed interface + input type)

**Prefix:** `'@subject/address/feature.'` (from `libs/subject/address/feature/src/lib/scope.ts`)

**Note:** The naming convention in this domain uses the **plural** form throughout: `ADDRESSES_I18N_KEYS`, `AddressesI18n`, `addresses.store.ts`. Keep this plural naming in the util file to avoid breaking existing consumers.

- [ ] **Step 1: Create address-i18n.ts**

Create `libs/subject/address/util/src/lib/address-i18n.ts`:

```ts
import { Signal } from '@angular/core';

const PFX = '@subject/address/feature.';

export const ADDRESSES_I18N_KEYS = {
  // Copy lines 52–257 from addresses.store.ts (const body)
  // Change `const` to `export const`
} satisfies Record<string, string>;

export type AddressesI18n = { [K in keyof typeof ADDRESSES_I18N_KEYS]: Signal<string> };
```

**Exact copy instruction:** open `libs/subject/address/feature/src/lib/addresses.store.ts`, copy lines 52–257. Change `const ADDRESSES_I18N_KEYS` to `export const ADDRESSES_I18N_KEYS` in the new file.

- [ ] **Step 2: Add export to barrel**

In `libs/subject/address/util/src/index.ts`, add at the end:
```ts
export * from './lib/address-i18n';
```

- [ ] **Step 3: Update addresses.store.ts**

a) Delete lines 52–258 (the `ADDRESSES_I18N_KEYS` block + `export type AddressesI18n` line).

b) Find the existing import from `@bk2/subject-address-util` and add:
```ts
import { ..., ADDRESSES_I18N_KEYS, AddressesI18n } from '@bk2/subject-address-util';
```

c) Remove `import { PFX } from './scope';` if PFX is no longer used.

- [ ] **Step 4: Update address.form.ts**

In `libs/subject/address/ui/src/lib/address.form.ts`:

a) Delete the `export interface AddressFormI18n { ... }` block.

b) Add import:
```ts
import { AddressesI18n } from '@bk2/subject-address-util';
```

c) Change input type:
```ts
public readonly i18n = input.required<AddressesI18n>();
```

d) Remove `Signal` from `@angular/core` import if unused.

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit -p libs/subject/address/util/tsconfig.json 2>&1 | grep -v "^$"
npx tsc --noEmit -p libs/subject/address/feature/tsconfig.json 2>&1 | grep -v "^$"
npx tsc --noEmit -p libs/subject/address/ui/tsconfig.json 2>&1 | grep -v "^$"
```

- [ ] **Step 6: Commit**

```bash
git add \
  libs/subject/address/util/src/lib/address-i18n.ts \
  libs/subject/address/util/src/index.ts \
  libs/subject/address/feature/src/lib/addresses.store.ts \
  libs/subject/address/ui/src/lib/address.form.ts
git commit -m "refactor(address): move ADDRESSES_I18N_KEYS and AddressesI18n to util layer

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 5: application domain

**Files:**
- Create: `libs/subject/application/util/src/lib/application-i18n.ts`
- Modify: `libs/subject/application/util/src/index.ts`
- Modify: `libs/subject/application/feature/src/lib/application.store.ts` (lines 19–74)
- Modify: `libs/subject/application/ui/src/lib/application.form.ts` (duck-typed interface + input type)

**Prefix:** This domain uses a global Transloco scope (`'@application/...'`), not the standard `'@subject/application/feature.'` pattern. There is no `scope.ts` in this feature. The keys are hardcoded strings — no `PFX` variable is used.

- [ ] **Step 1: Create application-i18n.ts**

Create `libs/subject/application/util/src/lib/application-i18n.ts`:

```ts
import { Signal } from '@angular/core';

export const APPLICATION_I18N_KEYS = {
  // Copy lines 19–73 from application.store.ts (const body)
  // Change `const` to `export const`
  // No PFX variable — keys are hardcoded strings like '@application/list.title'
} satisfies Record<string, string>;

export type ApplicationI18n = { [K in keyof typeof APPLICATION_I18N_KEYS]: Signal<string> };
```

**Exact copy instruction:** open `libs/subject/application/feature/src/lib/application.store.ts`, copy lines 19–73. Change `const APPLICATION_I18N_KEYS` to `export const APPLICATION_I18N_KEYS`. There is no `PFX` const to add — the keys already contain their full scope prefix.

- [ ] **Step 2: Add export to barrel**

In `libs/subject/application/util/src/index.ts`, add at the end:
```ts
export * from './lib/application-i18n';
```

- [ ] **Step 3: Update application.store.ts**

a) Delete lines 19–74 (the `APPLICATION_I18N_KEYS` block + `export type ApplicationI18n` line).

b) Find the existing import from `@bk2/application-util` (note: the import alias may be `@bk2/application-util`, not `@bk2/subject-application-util` — verify by reading `tsconfig.base.json` or the top imports of `application.store.ts`). Add the new exports:
```ts
import { ..., APPLICATION_I18N_KEYS, ApplicationI18n } from '@bk2/application-util';
```

- [ ] **Step 4: Update application.form.ts**

In `libs/subject/application/ui/src/lib/application.form.ts`:

a) Delete the `export interface ApplicationFormI18n { ... }` block.

b) Add import (use the same alias verified in Step 3):
```ts
import { ApplicationI18n } from '@bk2/application-util';
```

c) Change input type:
```ts
public readonly i18n = input.required<ApplicationI18n>();
```

d) Remove `Signal` from `@angular/core` import if unused.

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit -p libs/subject/application/util/tsconfig.json 2>&1 | grep -v "^$"
npx tsc --noEmit -p libs/subject/application/feature/tsconfig.json 2>&1 | grep -v "^$"
npx tsc --noEmit -p libs/subject/application/ui/tsconfig.json 2>&1 | grep -v "^$"
```

- [ ] **Step 6: Commit**

```bash
git add \
  libs/subject/application/util/src/lib/application-i18n.ts \
  libs/subject/application/util/src/index.ts \
  libs/subject/application/feature/src/lib/application.store.ts \
  libs/subject/application/ui/src/lib/application.form.ts
git commit -m "refactor(application): move APPLICATION_I18N_KEYS and ApplicationI18n to util layer

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

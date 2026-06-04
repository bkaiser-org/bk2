# i18n Util Migration — Relationship Domains Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move `FEATURE_I18N_KEYS` + `FeatureI18n` type from each feature store into `<domain>-i18n.ts` in the util layer, then replace duck-typed form interfaces with the full `FeatureI18n` type, for all eight `relationship/*` domains.

**Architecture:** Same pattern as `libs/subject/person/util/src/lib/person-i18n.ts` (completed). Each task creates a `<domain>-i18n.ts` in the existing util lib, exports it from `index.ts`, strips the local definition from the store, and updates each form to use the full `FeatureI18n` input type. Membership is the only domain with two stores — both go in one util file.

**Tech Stack:** Angular 20, TypeScript strict, NgRx Signal Stores, Nx monorepo, pnpm.

---

## Quick reference: the pattern

```ts
// libs/relationship/<domain>/util/src/lib/<domain>-i18n.ts
import { Signal } from '@angular/core';
const PFX = '@relationship/<domain>/feature.';
export const DOMAIN_I18N_KEYS = { ... } satisfies Record<string, string>;
export type DomainI18n = { [K in keyof typeof DOMAIN_I18N_KEYS]: Signal<string> };
```

Store change — remove local block, add to existing util import:
```ts
import { ..., DOMAIN_I18N_KEYS, DomainI18n } from '@bk2/relationship-<domain>-util';
```

Form change — remove duck-typed interface, switch input type:
```ts
import { DomainI18n } from '@bk2/relationship-<domain>-util';
public readonly i18n = input.required<DomainI18n>();
```

---

## File Map

| Action | File |
|--------|------|
| Create | `libs/relationship/invitation/util/src/lib/invitation-i18n.ts` |
| Modify | `libs/relationship/invitation/util/src/index.ts` |
| Modify | `libs/relationship/invitation/feature/src/lib/invitation.store.ts` |
| Modify | `libs/relationship/invitation/ui/src/lib/invitation.form.ts` |
| Create | `libs/relationship/membership/util/src/lib/membership-i18n.ts` |
| Modify | `libs/relationship/membership/util/src/index.ts` |
| Modify | `libs/relationship/membership/feature/src/lib/membership.store.ts` |
| Modify | `libs/relationship/membership/feature/src/lib/scs-member-fees.store.ts` |
| Modify | `libs/relationship/membership/ui/src/lib/membership.form.ts` |
| Modify | `libs/relationship/membership/ui/src/lib/member-new.form.ts` |
| Modify | `libs/relationship/membership/ui/src/lib/category-change.form.ts` |
| Modify | `libs/relationship/membership/ui/src/lib/scs-member-fee-edit.form.ts` |
| Create | `libs/relationship/ownership/util/src/lib/ownership-i18n.ts` |
| Modify | `libs/relationship/ownership/util/src/index.ts` |
| Modify | `libs/relationship/ownership/feature/src/lib/ownership.store.ts` |
| Create | `libs/relationship/personal-rel/util/src/lib/personal-rel-i18n.ts` |
| Modify | `libs/relationship/personal-rel/util/src/index.ts` |
| Modify | `libs/relationship/personal-rel/feature/src/lib/personal-rel.store.ts` |
| Modify | `libs/relationship/personal-rel/ui/src/lib/personal-rel.form.ts` |
| Create | `libs/relationship/reservation/util/src/lib/reservation-i18n.ts` |
| Modify | `libs/relationship/reservation/util/src/index.ts` |
| Modify | `libs/relationship/reservation/feature/src/lib/reservation.store.ts` |
| Modify | `libs/relationship/reservation/ui/src/lib/reservation.form.ts` |
| Modify | `libs/relationship/reservation/ui/src/lib/reservation-apply.form.ts` |
| Create | `libs/relationship/responsibility/util/src/lib/responsibility-i18n.ts` |
| Modify | `libs/relationship/responsibility/util/src/index.ts` |
| Modify | `libs/relationship/responsibility/feature/src/lib/responsibility.store.ts` |
| Modify | `libs/relationship/responsibility/ui/src/lib/responsibility.form.ts` |
| Create | `libs/relationship/transfer/util/src/lib/transfer-i18n.ts` |
| Modify | `libs/relationship/transfer/util/src/index.ts` |
| Modify | `libs/relationship/transfer/feature/src/lib/transfer.store.ts` |
| Modify | `libs/relationship/transfer/ui/src/lib/transfer.form.ts` |
| Create | `libs/relationship/workrel/util/src/lib/workrel-i18n.ts` |
| Modify | `libs/relationship/workrel/util/src/index.ts` |
| Modify | `libs/relationship/workrel/feature/src/lib/workrel.store.ts` |
| Modify | `libs/relationship/workrel/ui/src/lib/workrel.form.ts` |

---

### Task 1: invitation domain

**Store key range:** `libs/relationship/invitation/feature/src/lib/invitation.store.ts` lines 41–78
**Keys const:** `INVITATION_I18N_KEYS` | **Type:** `InvitationI18n`
**PFX:** `'@relationship/invitation/feature.'`
**Util alias:** `@bk2/relationship-invitation-util`
**Forms to update:** `libs/relationship/invitation/ui/src/lib/invitation.form.ts` (remove `InvitationFormI18n`)

- [ ] **Step 1: Create invitation-i18n.ts**

Create `libs/relationship/invitation/util/src/lib/invitation-i18n.ts`:
```ts
import { Signal } from '@angular/core';

const PFX = '@relationship/invitation/feature.';

export const INVITATION_I18N_KEYS = {
  // Copy lines 42–76 from invitation.store.ts verbatim
  // Change `const` to `export const` in the declaration
} satisfies Record<string, string>;

export type InvitationI18n = { [K in keyof typeof INVITATION_I18N_KEYS]: Signal<string> };
```

- [ ] **Step 2: Export from barrel**

In `libs/relationship/invitation/util/src/index.ts` append:
```ts
export * from './lib/invitation-i18n';
```

- [ ] **Step 3: Update invitation.store.ts**

a) Delete lines 41–78 (const block + type line).
b) Remove `import { PFX } from './scope';` (no longer needed).
c) Add `INVITATION_I18N_KEYS, InvitationI18n` to the existing `@bk2/relationship-invitation-util` import.
d) Remove `Signal` from `@angular/core` if unused.

- [ ] **Step 4: Update invitation.form.ts**

a) Delete `export interface InvitationFormI18n { ... }`.
b) Remove `Signal` from `@angular/core` if unused.
c) Add `import { InvitationI18n } from '@bk2/relationship-invitation-util';`
d) Change `input.required<InvitationFormI18n>()` → `input.required<InvitationI18n>()`.

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit -p libs/relationship/invitation/util/tsconfig.json 2>&1 | grep -v "^$"
npx tsc --noEmit -p libs/relationship/invitation/feature/tsconfig.json 2>&1 | grep -v "^$"
npx tsc --noEmit -p libs/relationship/invitation/ui/tsconfig.json 2>&1 | grep -v "^$"
```

- [ ] **Step 6: Commit**

```bash
git add \
  libs/relationship/invitation/util/src/lib/invitation-i18n.ts \
  libs/relationship/invitation/util/src/index.ts \
  libs/relationship/invitation/feature/src/lib/invitation.store.ts \
  libs/relationship/invitation/ui/src/lib/invitation.form.ts
git commit -m "refactor(invitation): move INVITATION_I18N_KEYS and InvitationI18n to util layer

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 2: membership domain

**SPECIAL:** Two stores share one util file. Both key sets go in `membership-i18n.ts`.

**Store 1:** `libs/relationship/membership/feature/src/lib/membership.store.ts` lines 75–279
- Keys const: `MEMBERSHIP_I18N_KEYS` | Type: `MembershipI18n`

**Store 2:** `libs/relationship/membership/feature/src/lib/scs-member-fees.store.ts` lines 41–116
- Keys const: `SCS_MEMBER_FEES_I18N_KEYS` | Type: `ScsMemberFeesI18n`

**PFX (both):** `'@relationship/membership/feature.'`
**Util alias:** `@bk2/relationship-membership-util`
**Forms to update:** `membership.form.ts`, `member-new.form.ts`, `category-change.form.ts`, `scs-member-fee-edit.form.ts`

- [ ] **Step 1: Create membership-i18n.ts**

Create `libs/relationship/membership/util/src/lib/membership-i18n.ts`:
```ts
import { Signal } from '@angular/core';

const PFX = '@relationship/membership/feature.';

export const MEMBERSHIP_I18N_KEYS = {
  // Copy lines 76–278 from membership.store.ts verbatim
} satisfies Record<string, string>;

export type MembershipI18n = { [K in keyof typeof MEMBERSHIP_I18N_KEYS]: Signal<string> };

export const SCS_MEMBER_FEES_I18N_KEYS = {
  // Copy lines 42–115 from scs-member-fees.store.ts verbatim
} satisfies Record<string, string>;

export type ScsMemberFeesI18n = { [K in keyof typeof SCS_MEMBER_FEES_I18N_KEYS]: Signal<string> };
```

- [ ] **Step 2: Export from barrel**

In `libs/relationship/membership/util/src/index.ts` append:
```ts
export * from './lib/membership-i18n';
```

- [ ] **Step 3: Update membership.store.ts**

a) Delete lines 75–279 (MEMBERSHIP_I18N_KEYS block + MembershipI18n type).
b) Remove `import { PFX } from './scope';`.
c) Add `MEMBERSHIP_I18N_KEYS, MembershipI18n` to existing `@bk2/relationship-membership-util` import.
d) Remove `Signal` from `@angular/core` if unused.

- [ ] **Step 4: Update scs-member-fees.store.ts**

a) Delete lines 41–116 (SCS_MEMBER_FEES_I18N_KEYS block + ScsMemberFeesI18n type).
b) Remove `import { PFX } from './scope';`.
c) Add `SCS_MEMBER_FEES_I18N_KEYS, ScsMemberFeesI18n` to existing `@bk2/relationship-membership-util` import.
d) Remove `Signal` from `@angular/core` if unused.

- [ ] **Step 5: Update four form files**

For each form below, perform the same changes:
- Delete `export interface XxxFormI18n { ... }`
- Remove `Signal` from `@angular/core` if unused
- Add `import { MembershipI18n } from '@bk2/relationship-membership-util';` (or `ScsMemberFeesI18n` for the fees form)
- Change `input.required<XxxFormI18n>()` → `input.required<MembershipI18n>()` (or `ScsMemberFeesI18n`)

**Files and their types:**
- `libs/relationship/membership/ui/src/lib/membership.form.ts` — `MembershipFormI18n` → `MembershipI18n`
- `libs/relationship/membership/ui/src/lib/member-new.form.ts` — `MemberNewFormI18n` → `MembershipI18n`
- `libs/relationship/membership/ui/src/lib/category-change.form.ts` — `CategoryChangeFormI18n` → `MembershipI18n`
- `libs/relationship/membership/ui/src/lib/scs-member-fee-edit.form.ts` — `ScsMemberFeeEditFormI18n` → `ScsMemberFeesI18n`

- [ ] **Step 6: Type-check**

```bash
npx tsc --noEmit -p libs/relationship/membership/util/tsconfig.json 2>&1 | grep -v "^$"
npx tsc --noEmit -p libs/relationship/membership/feature/tsconfig.json 2>&1 | grep -v "^$"
npx tsc --noEmit -p libs/relationship/membership/ui/tsconfig.json 2>&1 | grep -v "^$"
```

- [ ] **Step 7: Commit**

```bash
git add \
  libs/relationship/membership/util/src/lib/membership-i18n.ts \
  libs/relationship/membership/util/src/index.ts \
  libs/relationship/membership/feature/src/lib/membership.store.ts \
  libs/relationship/membership/feature/src/lib/scs-member-fees.store.ts \
  libs/relationship/membership/ui/src/lib/membership.form.ts \
  libs/relationship/membership/ui/src/lib/member-new.form.ts \
  libs/relationship/membership/ui/src/lib/category-change.form.ts \
  libs/relationship/membership/ui/src/lib/scs-member-fee-edit.form.ts
git commit -m "refactor(membership): move MEMBERSHIP_I18N_KEYS and MembershipI18n to util layer

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 3: ownership domain

**Store key range:** `libs/relationship/ownership/feature/src/lib/ownership.store.ts` lines 60–121
**Keys const:** `OWNERSHIP_I18N_KEYS` | **Type:** `OwnershipI18n`
**PFX:** `'@relationship/ownership/feature.'`
**Util alias:** `@bk2/relationship-ownership-util`
**Forms:** No duck-typed form interface — only store + barrel update needed.

- [ ] **Step 1: Create ownership-i18n.ts**

Create `libs/relationship/ownership/util/src/lib/ownership-i18n.ts`:
```ts
import { Signal } from '@angular/core';

const PFX = '@relationship/ownership/feature.';

export const OWNERSHIP_I18N_KEYS = {
  // Copy lines 61–120 from ownership.store.ts verbatim
} satisfies Record<string, string>;

export type OwnershipI18n = { [K in keyof typeof OWNERSHIP_I18N_KEYS]: Signal<string> };
```

- [ ] **Step 2: Export from barrel**

In `libs/relationship/ownership/util/src/index.ts` append:
```ts
export * from './lib/ownership-i18n';
```

- [ ] **Step 3: Update ownership.store.ts**

a) Delete lines 60–121 (const block + type line).
b) Remove `import { PFX } from './scope';`.
c) Add `OWNERSHIP_I18N_KEYS, OwnershipI18n` to the existing `@bk2/relationship-ownership-util` import.
d) Remove `Signal` from `@angular/core` if unused.

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit -p libs/relationship/ownership/util/tsconfig.json 2>&1 | grep -v "^$"
npx tsc --noEmit -p libs/relationship/ownership/feature/tsconfig.json 2>&1 | grep -v "^$"
```

- [ ] **Step 5: Commit**

```bash
git add \
  libs/relationship/ownership/util/src/lib/ownership-i18n.ts \
  libs/relationship/ownership/util/src/index.ts \
  libs/relationship/ownership/feature/src/lib/ownership.store.ts
git commit -m "refactor(ownership): move OWNERSHIP_I18N_KEYS and OwnershipI18n to util layer

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 4: personal-rel domain

**Store key range:** `libs/relationship/personal-rel/feature/src/lib/personal-rel.store.ts` lines 37–70
**Keys const:** `PERSONAL_REL_I18N_KEYS` | **Type:** `PersonalRelI18n`
**PFX:** `'@relationship/personal-rel/feature.'`
**Util alias:** `@bk2/relationship-personal-rel-util`
**Forms:** `libs/relationship/personal-rel/ui/src/lib/personal-rel.form.ts` (remove `PersonalRelFormI18n`)

- [ ] **Step 1: Create personal-rel-i18n.ts**

Create `libs/relationship/personal-rel/util/src/lib/personal-rel-i18n.ts`:
```ts
import { Signal } from '@angular/core';

const PFX = '@relationship/personal-rel/feature.';

export const PERSONAL_REL_I18N_KEYS = {
  // Copy lines 38–69 from personal-rel.store.ts verbatim
} satisfies Record<string, string>;

export type PersonalRelI18n = { [K in keyof typeof PERSONAL_REL_I18N_KEYS]: Signal<string> };
```

- [ ] **Step 2: Export from barrel**

In `libs/relationship/personal-rel/util/src/index.ts` append:
```ts
export * from './lib/personal-rel-i18n';
```

- [ ] **Step 3: Update personal-rel.store.ts**

a) Delete lines 37–70 (const block + type line).
b) Remove `import { PFX } from './scope';`.
c) Add `PERSONAL_REL_I18N_KEYS, PersonalRelI18n` to the existing `@bk2/relationship-personal-rel-util` import.
d) Remove `Signal` from `@angular/core` if unused.

- [ ] **Step 4: Update personal-rel.form.ts**

a) Delete `export interface PersonalRelFormI18n { ... }`.
b) Remove `Signal` from `@angular/core` if unused.
c) Add `import { PersonalRelI18n } from '@bk2/relationship-personal-rel-util';`
d) Change `input.required<PersonalRelFormI18n>()` → `input.required<PersonalRelI18n>()`.

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit -p libs/relationship/personal-rel/util/tsconfig.json 2>&1 | grep -v "^$"
npx tsc --noEmit -p libs/relationship/personal-rel/feature/tsconfig.json 2>&1 | grep -v "^$"
npx tsc --noEmit -p libs/relationship/personal-rel/ui/tsconfig.json 2>&1 | grep -v "^$"
```

- [ ] **Step 6: Commit**

```bash
git add \
  libs/relationship/personal-rel/util/src/lib/personal-rel-i18n.ts \
  libs/relationship/personal-rel/util/src/index.ts \
  libs/relationship/personal-rel/feature/src/lib/personal-rel.store.ts \
  libs/relationship/personal-rel/ui/src/lib/personal-rel.form.ts
git commit -m "refactor(personal-rel): move PERSONAL_REL_I18N_KEYS and PersonalRelI18n to util layer

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 5: reservation domain

**Store key range:** `libs/relationship/reservation/feature/src/lib/reservation.store.ts` lines 56–128
**Keys const:** `RESERVATION_I18N_KEYS` | **Type:** `ReservationI18n`
**PFX:** `'@relationship/reservation/feature.'`
**Util alias:** `@bk2/relationship-reservation-util`
**Forms:** `reservation.form.ts` (remove `ReservationFormI18n`), `reservation-apply.form.ts` (remove `ReservationApplyFormI18n`)

- [ ] **Step 1: Create reservation-i18n.ts**

Create `libs/relationship/reservation/util/src/lib/reservation-i18n.ts`:
```ts
import { Signal } from '@angular/core';

const PFX = '@relationship/reservation/feature.';

export const RESERVATION_I18N_KEYS = {
  // Copy lines 57–127 from reservation.store.ts verbatim
} satisfies Record<string, string>;

export type ReservationI18n = { [K in keyof typeof RESERVATION_I18N_KEYS]: Signal<string> };
```

- [ ] **Step 2: Export from barrel**

In `libs/relationship/reservation/util/src/index.ts` append:
```ts
export * from './lib/reservation-i18n';
```

- [ ] **Step 3: Update reservation.store.ts**

a) Delete lines 56–128 (const block + type line).
b) Remove `import { PFX } from './scope';`.
c) Add `RESERVATION_I18N_KEYS, ReservationI18n` to existing `@bk2/relationship-reservation-util` import.
d) Remove `Signal` from `@angular/core` if unused.

- [ ] **Step 4: Update reservation.form.ts**

a) Delete `export interface ReservationFormI18n { ... }`.
b) Remove `Signal` from `@angular/core` if unused.
c) Add `import { ReservationI18n } from '@bk2/relationship-reservation-util';`
d) Change input type to `ReservationI18n`.

- [ ] **Step 5: Update reservation-apply.form.ts**

a) Delete `export interface ReservationApplyFormI18n { ... }`.
b) Remove `Signal` from `@angular/core` if unused.
c) Add `import { ReservationI18n } from '@bk2/relationship-reservation-util';`
d) Change input type to `ReservationI18n`.

- [ ] **Step 6: Type-check**

```bash
npx tsc --noEmit -p libs/relationship/reservation/util/tsconfig.json 2>&1 | grep -v "^$"
npx tsc --noEmit -p libs/relationship/reservation/feature/tsconfig.json 2>&1 | grep -v "^$"
npx tsc --noEmit -p libs/relationship/reservation/ui/tsconfig.json 2>&1 | grep -v "^$"
```

- [ ] **Step 7: Commit**

```bash
git add \
  libs/relationship/reservation/util/src/lib/reservation-i18n.ts \
  libs/relationship/reservation/util/src/index.ts \
  libs/relationship/reservation/feature/src/lib/reservation.store.ts \
  libs/relationship/reservation/ui/src/lib/reservation.form.ts \
  libs/relationship/reservation/ui/src/lib/reservation-apply.form.ts
git commit -m "refactor(reservation): move RESERVATION_I18N_KEYS and ReservationI18n to util layer

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 6: responsibility domain

**Store key range:** `libs/relationship/responsibility/feature/src/lib/responsibility.store.ts` lines 35–74
**Keys const:** `RESPONSIBILITY_I18N_KEYS` | **Type:** `ResponsibilityI18n`
**PFX:** `'@relationship/responsibility/feature.'`
**Util alias:** `@bk2/relationship-responsibility-util`
**Forms:** `libs/relationship/responsibility/ui/src/lib/responsibility.form.ts` (remove `ResponsibilityFormI18n`)

- [ ] **Step 1: Create responsibility-i18n.ts**

Create `libs/relationship/responsibility/util/src/lib/responsibility-i18n.ts`:
```ts
import { Signal } from '@angular/core';

const PFX = '@relationship/responsibility/feature.';

export const RESPONSIBILITY_I18N_KEYS = {
  // Copy lines 36–73 from responsibility.store.ts verbatim
} satisfies Record<string, string>;

export type ResponsibilityI18n = { [K in keyof typeof RESPONSIBILITY_I18N_KEYS]: Signal<string> };
```

- [ ] **Step 2: Export from barrel**

In `libs/relationship/responsibility/util/src/index.ts` append:
```ts
export * from './lib/responsibility-i18n';
```

- [ ] **Step 3: Update responsibility.store.ts**

a) Delete lines 35–74.
b) Remove `import { PFX } from './scope';`.
c) Add `RESPONSIBILITY_I18N_KEYS, ResponsibilityI18n` to the `@bk2/relationship-responsibility-util` import.
d) Remove `Signal` from `@angular/core` if unused.

- [ ] **Step 4: Update responsibility.form.ts**

a) Delete `export interface ResponsibilityFormI18n { ... }`.
b) Remove `Signal` from `@angular/core` if unused.
c) Add `import { ResponsibilityI18n } from '@bk2/relationship-responsibility-util';`
d) Change input type to `ResponsibilityI18n`.

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit -p libs/relationship/responsibility/util/tsconfig.json 2>&1 | grep -v "^$"
npx tsc --noEmit -p libs/relationship/responsibility/feature/tsconfig.json 2>&1 | grep -v "^$"
npx tsc --noEmit -p libs/relationship/responsibility/ui/tsconfig.json 2>&1 | grep -v "^$"
```

- [ ] **Step 6: Commit**

```bash
git add \
  libs/relationship/responsibility/util/src/lib/responsibility-i18n.ts \
  libs/relationship/responsibility/util/src/index.ts \
  libs/relationship/responsibility/feature/src/lib/responsibility.store.ts \
  libs/relationship/responsibility/ui/src/lib/responsibility.form.ts
git commit -m "refactor(responsibility): move RESPONSIBILITY_I18N_KEYS and ResponsibilityI18n to util layer

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 7: transfer domain

**Store key range:** `libs/relationship/transfer/feature/src/lib/transfer.store.ts` lines 35–72
**Keys const:** `TRANSFER_I18N_KEYS` | **Type:** `TransferI18n`
**PFX:** `'@relationship/transfer/feature.'`
**Util alias:** `@bk2/relationship-transfer-util`
**Forms:** `libs/relationship/transfer/ui/src/lib/transfer.form.ts` (remove `TransferFormI18n`)

- [ ] **Step 1: Create transfer-i18n.ts**

Create `libs/relationship/transfer/util/src/lib/transfer-i18n.ts`:
```ts
import { Signal } from '@angular/core';

const PFX = '@relationship/transfer/feature.';

export const TRANSFER_I18N_KEYS = {
  // Copy lines 36–71 from transfer.store.ts verbatim
} satisfies Record<string, string>;

export type TransferI18n = { [K in keyof typeof TRANSFER_I18N_KEYS]: Signal<string> };
```

- [ ] **Step 2: Export from barrel**

In `libs/relationship/transfer/util/src/index.ts` append:
```ts
export * from './lib/transfer-i18n';
```

- [ ] **Step 3: Update transfer.store.ts**

a) Delete lines 35–72.
b) Remove `import { PFX } from './scope';`.
c) Add `TRANSFER_I18N_KEYS, TransferI18n` to the `@bk2/relationship-transfer-util` import.
d) Remove `Signal` from `@angular/core` if unused.

- [ ] **Step 4: Update transfer.form.ts**

a) Delete `export interface TransferFormI18n { ... }`.
b) Remove `Signal` from `@angular/core` if unused.
c) Add `import { TransferI18n } from '@bk2/relationship-transfer-util';`
d) Change input type to `TransferI18n`.

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit -p libs/relationship/transfer/util/tsconfig.json 2>&1 | grep -v "^$"
npx tsc --noEmit -p libs/relationship/transfer/feature/tsconfig.json 2>&1 | grep -v "^$"
npx tsc --noEmit -p libs/relationship/transfer/ui/tsconfig.json 2>&1 | grep -v "^$"
```

- [ ] **Step 6: Commit**

```bash
git add \
  libs/relationship/transfer/util/src/lib/transfer-i18n.ts \
  libs/relationship/transfer/util/src/index.ts \
  libs/relationship/transfer/feature/src/lib/transfer.store.ts \
  libs/relationship/transfer/ui/src/lib/transfer.form.ts
git commit -m "refactor(transfer): move TRANSFER_I18N_KEYS and TransferI18n to util layer

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 8: workrel domain

**Store key range:** `libs/relationship/workrel/feature/src/lib/workrel.store.ts` lines 41–83
**Keys const:** `WORKREL_I18N_KEYS` | **Type:** `WorkrelI18n`
**PFX:** `'@relationship/workrel/feature.'`
**Util alias:** `@bk2/relationship-workrel-util`
**Forms:** `libs/relationship/workrel/ui/src/lib/workrel.form.ts` (remove `WorkrelFormI18n`)

- [ ] **Step 1: Create workrel-i18n.ts**

Create `libs/relationship/workrel/util/src/lib/workrel-i18n.ts`:
```ts
import { Signal } from '@angular/core';

const PFX = '@relationship/workrel/feature.';

export const WORKREL_I18N_KEYS = {
  // Copy lines 42–82 from workrel.store.ts verbatim
} satisfies Record<string, string>;

export type WorkrelI18n = { [K in keyof typeof WORKREL_I18N_KEYS]: Signal<string> };
```

- [ ] **Step 2: Export from barrel**

In `libs/relationship/workrel/util/src/index.ts` append:
```ts
export * from './lib/workrel-i18n';
```

- [ ] **Step 3: Update workrel.store.ts**

a) Delete lines 41–83.
b) Remove `import { PFX } from './scope';`.
c) Add `WORKREL_I18N_KEYS, WorkrelI18n` to the `@bk2/relationship-workrel-util` import.
d) Remove `Signal` from `@angular/core` if unused.

- [ ] **Step 4: Update workrel.form.ts**

a) Delete `export interface WorkrelFormI18n { ... }`.
b) Remove `Signal` from `@angular/core` if unused.
c) Add `import { WorkrelI18n } from '@bk2/relationship-workrel-util';`
d) Change input type to `WorkrelI18n`.

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit -p libs/relationship/workrel/util/tsconfig.json 2>&1 | grep -v "^$"
npx tsc --noEmit -p libs/relationship/workrel/feature/tsconfig.json 2>&1 | grep -v "^$"
npx tsc --noEmit -p libs/relationship/workrel/ui/tsconfig.json 2>&1 | grep -v "^$"
```

- [ ] **Step 6: Commit**

```bash
git add \
  libs/relationship/workrel/util/src/lib/workrel-i18n.ts \
  libs/relationship/workrel/util/src/index.ts \
  libs/relationship/workrel/feature/src/lib/workrel.store.ts \
  libs/relationship/workrel/ui/src/lib/workrel.form.ts
git commit -m "refactor(workrel): move WORKREL_I18N_KEYS and WorkrelI18n to util layer

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

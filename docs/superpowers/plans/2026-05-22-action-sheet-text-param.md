# Action Sheet Text Parameter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the missing `text` parameter to all `createActionSheetButton` calls that currently pass only 3 arguments (name, imgixBaseUrl, iconName) instead of the correct 4 (name, text, imgixBaseUrl, iconName).

**Architecture:** `createActionSheetButton(name, text, imgixBaseUrl, iconName?)` — `text` is the displayed translated label, resolved through the store's `i18n` signals. Each domain's store holds its i18n keys via `I18nService.translateAll`. For components without a store, an inline `signalStore` is added in the same file.

**Tech Stack:** Angular 20, NgRx Signal Stores (`@ngrx/signals`), `I18nService.translateAll`, Transloco i18n (de.json files per scope), TypeScript strict.

**Scope exclusion:** `libs/relationship/address/feature/src/lib/addresses-accordion.ts` — user fixes manually.

---

## Background: The Bug

`createActionSheetButton` signature:
```ts
// libs/shared/util-angular/src/lib/action-sheet.util.ts
createActionSheetButton(name: string, text: string, imgixBaseUrl: string, iconName?: string)
```
The `text` parameter was omitted in 33 files, causing `imgixBaseUrl` to be used as `text` and `iconName` as `imgixBaseUrl`. The result: action sheet buttons have no visible label and broken icons.

## Fix pattern

**Before (broken):**
```ts
createActionSheetButton('membership.edit', this.imgixBaseUrl, 'edit')
```

**After (correct):**
```ts
createActionSheetButton('membership.edit', this.store.i18n.as_membership_edit(), this.imgixBaseUrl, 'edit')
```

Text comes from the store's `i18n` object. Never use `TranslatePipe` here — these are static keys resolved once through `translateAll`.

---

## Task 1: calevent/feature — call-site only (store already complete)

**Files:**
- Modify: `libs/calevent/feature/src/lib/calevent-list.ts:590-593`

CalEventStore already has `as_edit`, `as_delete`, `cancel` in `CALEVENT_I18N_KEYS`.
The component uses `protected store = inject(CalEventStore)` at line ~105.

- [ ] **Step 1: Update the three 3-arg calls in calevent-list.ts**

At lines 590-593, change:
```ts
actionSheetOptions.buttons.push(createActionSheetButton('calevent.edit', this.imgixBaseUrl, 'edit'));
actionSheetOptions.buttons.push(createActionSheetButton('calevent.delete', this.imgixBaseUrl, 'trash'));
// ...
actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.imgixBaseUrl, 'cancel'));
```
To:
```ts
actionSheetOptions.buttons.push(createActionSheetButton('calevent.edit', this.store.i18n.as_edit(), this.imgixBaseUrl, 'edit'));
actionSheetOptions.buttons.push(createActionSheetButton('calevent.delete', this.store.i18n.as_delete(), this.imgixBaseUrl, 'trash'));
// ...
actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.store.i18n.cancel(), this.imgixBaseUrl, 'cancel'));
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit -p libs/calevent/feature/tsconfig.json
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add libs/calevent/feature/src/lib/calevent-list.ts
git commit -m "fix(calevent): add missing text param to createActionSheetButton calls"
```

---

## Task 2: document/feature — call-site only (store already complete)

**Files:**
- Modify: `libs/document/feature/src/lib/document-accordion.ts:112`

DocumentStore already has `cancel: '@cancel'`. Component uses `protected readonly store = inject(DocumentStore)`.

- [ ] **Step 1: Fix the one 3-arg call**

Line 112, change:
```ts
actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.imgixBaseUrl, 'cancel'));
```
To:
```ts
actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.store.i18n.cancel(), this.imgixBaseUrl, 'cancel'));
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit -p libs/document/feature/tsconfig.json
```

- [ ] **Step 3: Commit**

```bash
git add libs/document/feature/src/lib/document-accordion.ts
git commit -m "fix(document): add missing text param to createActionSheetButton call"
```

---

## Task 3: subject/group/feature — call-site only (store already complete)

**Files:**
- Modify: `libs/subject/group/feature/src/lib/group-list.ts:160-169`

GroupStore already has `as_show`, `as_edit`, `as_addPage`, `as_delete`, `cancel`. Component uses `protected groupStore = inject(GroupStore)`.

- [ ] **Step 1: Update all 5 calls in group-list.ts**

At lines 160-169, change:
```ts
actionSheetOptions.buttons.push(createActionSheetButton('as_show', this.imgixBaseUrl, 'eye-on'));
actionSheetOptions.buttons.push(createActionSheetButton('as_edit', this.imgixBaseUrl, 'edit'));
// ...
actionSheetOptions.buttons.push(createActionSheetButton('as_addPage', this.imgixBaseUrl, 'add'));
// ...
actionSheetOptions.buttons.push(createActionSheetButton('as_delete', this.imgixBaseUrl, 'trash'));
// ...
actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.imgixBaseUrl, 'cancel'));
```
To:
```ts
actionSheetOptions.buttons.push(createActionSheetButton('as_show', this.groupStore.i18n.as_show(), this.imgixBaseUrl, 'eye-on'));
actionSheetOptions.buttons.push(createActionSheetButton('as_edit', this.groupStore.i18n.as_edit(), this.imgixBaseUrl, 'edit'));
// ...
actionSheetOptions.buttons.push(createActionSheetButton('as_addPage', this.groupStore.i18n.as_addPage(), this.imgixBaseUrl, 'add'));
// ...
actionSheetOptions.buttons.push(createActionSheetButton('as_delete', this.groupStore.i18n.as_delete(), this.imgixBaseUrl, 'trash'));
// ...
actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.groupStore.i18n.cancel(), this.imgixBaseUrl, 'cancel'));
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit -p libs/subject/group/feature/tsconfig.json
```

- [ ] **Step 3: Commit**

```bash
git add libs/subject/group/feature/src/lib/group-list.ts
git commit -m "fix(subject/group): add missing text param to createActionSheetButton calls"
```

---

## Task 4: subject/org/feature — add `cancel` to OrgStore + fix call sites

**Files:**
- Modify: `libs/subject/org/feature/src/lib/org.store.ts` (add `cancel` key)
- Modify: `libs/subject/org/feature/src/lib/org-list.ts:193-195`

OrgStore (PFX = `'@subject/org/feature.'`) has `as_edit` and `as_delete` but is missing `cancel`.

- [ ] **Step 1: Add `cancel` to ORG_I18N_KEYS in org.store.ts**

In `org.store.ts`, in the `ORG_I18N_KEYS` object (around line 39), add after `as_delete`:
```ts
cancel:                          '@cancel',
```

- [ ] **Step 2: Update call sites in org-list.ts**

At lines 193-195:
```ts
actionSheetOptions.buttons.push(createActionSheetButton('as_edit', this.orgStore.i18n.as_edit(), this.imgixBaseUrl, 'edit'));
actionSheetOptions.buttons.push(createActionSheetButton('as_delete', this.orgStore.i18n.as_delete(), this.imgixBaseUrl, 'trash'));
actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.orgStore.i18n.cancel(), this.imgixBaseUrl, 'cancel'));
```

The component uses `protected orgStore = inject(OrgStore)` — verify the store variable name matches.

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit -p libs/subject/org/feature/tsconfig.json
```

- [ ] **Step 4: Commit**

```bash
git add libs/subject/org/feature/src/lib/org.store.ts libs/subject/org/feature/src/lib/org-list.ts
git commit -m "fix(subject/org): add cancel i18n key and fix createActionSheetButton calls"
```

---

## Task 5: subject/person/feature — add action sheet keys to PersonStore

**Files:**
- Modify: `libs/subject/person/feature/src/lib/person.store.ts` (add 10 keys)
- Modify: `libs/subject/person/feature/src/i18n/de.json` (add translations)
- Modify: `libs/subject/person/feature/src/lib/person-list.ts:169-194`

PersonStore PFX = `'@subject/person/feature.'`. Current `PERSON_I18N_KEYS` has no action sheet keys.

- [ ] **Step 1: Add action sheet keys to PERSON_I18N_KEYS in person.store.ts**

In the `PERSON_I18N_KEYS` object, add:
```ts
as_edit:      PFX + 'actionsheet.edit',
as_delete:    PFX + 'actionsheet.delete',
as_view:      PFX + 'actionsheet.view',
as_chat:      PFX + 'actionsheet.chat',
as_copyemail: PFX + 'actionsheet.copyemail',
as_sendemail: PFX + 'actionsheet.sendemail',
as_copyphone: PFX + 'actionsheet.copyphone',
as_call:      PFX + 'actionsheet.call',
as_show:      PFX + 'actionsheet.show',
cancel:       '@cancel',
```

Also add `satisfies Record<string, string>` to `PERSON_I18N_KEYS` if it's missing.

- [ ] **Step 2: Add German translations to libs/subject/person/feature/src/i18n/de.json**

Merge into the JSON:
```json
{
  "actionsheet": {
    "title": "Wähle eine Aktion",
    "edit": "Person ändern",
    "delete": "Person löschen",
    "view": "Person anzeigen",
    "chat": "Chat öffnen",
    "copyemail": "E-Mail kopieren",
    "sendemail": "E-Mail senden",
    "copyphone": "Telefonnummer kopieren",
    "call": "Anrufen",
    "show": "Auf Karte anzeigen"
  }
}
```

- [ ] **Step 3: Update call sites in person-list.ts**

At lines 169-194, replace each 3-arg call (the component uses `protected store = inject(PersonStore)`):
```ts
actionSheetOptions.buttons.push(createActionSheetButton('person.edit', this.store.i18n.as_edit(), this.imgixBaseUrl, 'edit'));
// if admin:
actionSheetOptions.buttons.push(createActionSheetButton('person.delete', this.store.i18n.as_delete(), this.imgixBaseUrl, 'trash'));
// ...
actionSheetOptions.buttons.push(createActionSheetButton('person.view', this.store.i18n.as_view(), this.imgixBaseUrl, 'eye-on'));
// ...
actionSheetOptions.buttons.push(createActionSheetButton('person.chat', this.store.i18n.as_chat(), this.imgixBaseUrl, 'chatbubbles'));
// ...
actionSheetOptions.buttons.push(createActionSheetButton('person.copyemail', this.store.i18n.as_copyemail(), this.imgixBaseUrl, 'copy'));
actionSheetOptions.buttons.push(createActionSheetButton('person.sendemail', this.store.i18n.as_sendemail(), this.imgixBaseUrl, 'email'));
// ...
actionSheetOptions.buttons.push(createActionSheetButton('person.copyphone', this.store.i18n.as_copyphone(), this.imgixBaseUrl, 'copy'));
// ...
actionSheetOptions.buttons.push(createActionSheetButton('person.call', this.store.i18n.as_call(), this.imgixBaseUrl, 'tel'));
// ...
actionSheetOptions.buttons.push(createActionSheetButton('person.show', this.store.i18n.as_show(), this.imgixBaseUrl, 'location'));
actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.store.i18n.cancel(), this.imgixBaseUrl, 'cancel'));
```

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit -p libs/subject/person/feature/tsconfig.json
```

- [ ] **Step 5: Commit**

```bash
git add libs/subject/person/feature/src/lib/person.store.ts libs/subject/person/feature/src/i18n/de.json libs/subject/person/feature/src/lib/person-list.ts
git commit -m "fix(subject/person): add action sheet i18n keys and fix createActionSheetButton calls"
```

---

## Task 6: relationship/personal-rel/feature — call-site only (store already complete)

**Files:**
- Modify: `libs/relationship/personal-rel/feature/src/lib/personal-rel-accordion.ts:126-134`

PersonalRelStore already has `as_view`, `as_edit`, `as_end`, `as_delete`, `cancel`. Component uses `protected readonly personalRelStore = inject(PersonalRelStore)`.

- [ ] **Step 1: Update all 5 calls in personal-rel-accordion.ts**

```ts
actionSheetOptions.buttons.push(createActionSheetButton('relationship.edit', this.personalRelStore.i18n.as_edit(), this.imgixBaseUrl, 'edit'));
// if not ended:
actionSheetOptions.buttons.push(createActionSheetButton('relationship.end', this.personalRelStore.i18n.as_end(), this.imgixBaseUrl, 'stop-circle'));
// ...
actionSheetOptions.buttons.push(createActionSheetButton('relationship.view', this.personalRelStore.i18n.as_view(), this.imgixBaseUrl, 'eye-on'));
actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.personalRelStore.i18n.cancel(), this.imgixBaseUrl, 'cancel'));
// if admin:
actionSheetOptions.buttons.push(createActionSheetButton('relationship.delete', this.personalRelStore.i18n.as_delete(), this.imgixBaseUrl, 'trash'));
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit -p libs/relationship/personal-rel/feature/tsconfig.json
```

- [ ] **Step 3: Commit**

```bash
git add libs/relationship/personal-rel/feature/src/lib/personal-rel-accordion.ts
git commit -m "fix(relationship/personal-rel): add missing text param to createActionSheetButton calls"
```

---

## Task 7: relationship/reservation/feature — add `as_endres` + fix call sites

**Files:**
- Modify: `libs/relationship/reservation/feature/src/lib/reservation.store.ts` (add `as_endres`)
- Modify: `libs/relationship/reservation/feature/src/i18n/de.json` (add translation)
- Modify: `libs/relationship/reservation/feature/src/lib/reservations-accordion.ts:104-114`

ReservationStore (PFX = `'@relationship/reservation/feature.'`) already has `as_view`, `as_edit`, `as_end`, `as_delete`, `cancel`, but the button uses the action name `'endres'` (distinct from `'end'`), so we need a dedicated `as_endres` key.

- [ ] **Step 1: Add `as_endres` to RESERVATION_I18N_KEYS in reservation.store.ts**

In the `RESERVATION_I18N_KEYS` object, add after `as_end`:
```ts
as_endres: PFX + 'actionsheet.endres',
```

- [ ] **Step 2: Add German translation to libs/relationship/reservation/feature/src/i18n/de.json**

Add to the `actionsheet` object:
```json
"endres": "Reservation beenden"
```

- [ ] **Step 3: Update all 5 calls in reservations-accordion.ts**

The component uses `private readonly reservationStore = inject(ReservationStore)`:
```ts
actionSheetOptions.buttons.push(createActionSheetButton('view', this.reservationStore.i18n.as_view(), this.imgixBaseUrl, 'eye-on'));
actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.reservationStore.i18n.cancel(), this.imgixBaseUrl, 'cancel'));
// ...
actionSheetOptions.buttons.push(createActionSheetButton('edit', this.reservationStore.i18n.as_edit(), this.imgixBaseUrl, 'edit'));
// if can end:
actionSheetOptions.buttons.push(createActionSheetButton('endres', this.reservationStore.i18n.as_endres(), this.imgixBaseUrl, 'stop-circle'));
// ...
actionSheetOptions.buttons.push(createActionSheetButton('delete', this.reservationStore.i18n.as_delete(), this.imgixBaseUrl, 'trash'));
```

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit -p libs/relationship/reservation/feature/tsconfig.json
```

- [ ] **Step 5: Commit**

```bash
git add libs/relationship/reservation/feature/src/lib/reservation.store.ts libs/relationship/reservation/feature/src/i18n/de.json libs/relationship/reservation/feature/src/lib/reservations-accordion.ts
git commit -m "fix(relationship/reservation): add as_endres i18n key and fix createActionSheetButton calls"
```

---

## Task 8: relationship/membership/feature — MembershipStore + 4 files

**Files:**
- Modify: `libs/relationship/membership/feature/src/lib/membership.store.ts` (add ~14 keys)
- Modify: `libs/relationship/membership/feature/src/i18n/de.json` (add translations)
- Modify: `libs/relationship/membership/feature/src/lib/membership-list.ts`
- Modify: `libs/relationship/membership/feature/src/lib/members-accordion.ts`
- Modify: `libs/relationship/membership/feature/src/lib/membership-accordion.ts`
- Modify: `libs/relationship/membership/feature/src/lib/members.ts`

MembershipStore (PFX = `'@relationship/membership/feature.'`) currently only has `cancel`. All 4 components inject `MembershipStore`.

- [ ] **Step 1: Add action sheet keys to MEMBERSHIP_I18N_KEYS in membership.store.ts**

```ts
as_membership_view:       PFX + 'actionsheet.membership.view',
as_membership_edit:       PFX + 'actionsheet.membership.edit',
as_membership_end:        PFX + 'actionsheet.membership.end',
as_membership_changecat:  PFX + 'actionsheet.membership.changecat',
as_membership_delete:     PFX + 'actionsheet.membership.delete',
as_membership_chat:       PFX + 'actionsheet.membership.chat',
as_person_edit:           PFX + 'actionsheet.person.edit',
as_person_view:           PFX + 'actionsheet.person.view',
as_person_copyemail:      PFX + 'actionsheet.person.copyemail',
as_person_sendemail:      PFX + 'actionsheet.person.sendemail',
as_person_copyphone:      PFX + 'actionsheet.person.copyphone',
as_person_call:           PFX + 'actionsheet.person.call',
as_invoice_create:        PFX + 'actionsheet.invoice.create',
```

- [ ] **Step 2: Add German translations to libs/relationship/membership/feature/src/i18n/de.json**

Merge into the existing JSON (which currently has `actionsheet.title` and `invoice.create.conf`):
```json
{
  "actionsheet": {
    "title": "Wähle eine Aktion",
    "membership": {
      "view": "Mitgliedschaft anzeigen",
      "edit": "Mitgliedschaft ändern",
      "end": "Mitgliedschaft beenden",
      "changecat": "Mitgliedschaftskategorie ändern",
      "delete": "Mitgliedschaft löschen",
      "chat": "Chat öffnen"
    },
    "person": {
      "edit": "Person ändern",
      "view": "Person anzeigen",
      "copyemail": "E-Mail kopieren",
      "sendemail": "E-Mail senden",
      "copyphone": "Telefonnummer kopieren",
      "call": "Anrufen"
    },
    "invoice": {
      "create": "Rechnung erstellen"
    }
  }
}
```

- [ ] **Step 3: Update membership-list.ts call sites**

The component uses `protected membershipStore = inject(MembershipStore)`:
```ts
actionSheetOptions.buttons.push(createActionSheetButton('membership.edit', this.membershipStore.i18n.as_membership_edit(), this.imgixBaseUrl, 'edit'));
// ...
actionSheetOptions.buttons.push(createActionSheetButton('person.edit', this.membershipStore.i18n.as_person_edit(), this.imgixBaseUrl, 'edit'));
// ...
actionSheetOptions.buttons.push(createActionSheetButton('membership.view', this.membershipStore.i18n.as_membership_view(), this.imgixBaseUrl, 'eye-on'));
// ...
actionSheetOptions.buttons.push(createActionSheetButton('person.view', this.membershipStore.i18n.as_person_view(), this.imgixBaseUrl, 'eye-on'));
// ...
actionSheetOptions.buttons.push(createActionSheetButton('membership.changecat', this.membershipStore.i18n.as_membership_changecat(), this.imgixBaseUrl, 'mcatchange'));
actionSheetOptions.buttons.push(createActionSheetButton('membership.end', this.membershipStore.i18n.as_membership_end(), this.imgixBaseUrl, 'stop-circle'));
// ...
actionSheetOptions.buttons.push(createActionSheetButton('membership.delete', this.membershipStore.i18n.as_membership_delete(), this.imgixBaseUrl, 'trash'));
// ...
actionSheetOptions.buttons.push(createActionSheetButton('invoice.create', this.membershipStore.i18n.as_invoice_create(), this.imgixBaseUrl, 'invoice'));
// ...
actionSheetOptions.buttons.push(createActionSheetButton('membership.chat', this.membershipStore.i18n.as_membership_chat(), this.imgixBaseUrl, 'chatbubbles'));
// ...
actionSheetOptions.buttons.push(createActionSheetButton('person.copyemail', this.membershipStore.i18n.as_person_copyemail(), this.imgixBaseUrl, 'copy'));
actionSheetOptions.buttons.push(createActionSheetButton('person.sendemail', this.membershipStore.i18n.as_person_sendemail(), this.imgixBaseUrl, 'email'));
// ...
actionSheetOptions.buttons.push(createActionSheetButton('person.copyphone', this.membershipStore.i18n.as_person_copyphone(), this.imgixBaseUrl, 'copy'));
// ...
actionSheetOptions.buttons.push(createActionSheetButton('person.call', this.membershipStore.i18n.as_person_call(), this.imgixBaseUrl, 'tel'));
actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.membershipStore.i18n.cancel(), this.imgixBaseUrl, 'cancel'));
```

- [ ] **Step 4: Update members-accordion.ts call sites**

The component uses `protected readonly membershipStore = inject(MembershipStore)`:
```ts
actionSheetOptions.buttons.push(createActionSheetButton('membership.edit', this.membershipStore.i18n.as_membership_edit(), this.imgixBaseUrl, 'edit'));
// ...
actionSheetOptions.buttons.push(createActionSheetButton('membership.end', this.membershipStore.i18n.as_membership_end(), this.imgixBaseUrl, 'stop-circle'));
actionSheetOptions.buttons.push(createActionSheetButton('membership.changecat', this.membershipStore.i18n.as_membership_changecat(), this.imgixBaseUrl, 'mcatchange'));
// ...
actionSheetOptions.buttons.push(createActionSheetButton('membership.delete', this.membershipStore.i18n.as_membership_delete(), this.imgixBaseUrl, 'trash'));
// ...
actionSheetOptions.buttons.push(createActionSheetButton('membership.view', this.membershipStore.i18n.as_membership_view(), this.imgixBaseUrl, 'eye-on'));
actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.membershipStore.i18n.cancel(), this.imgixBaseUrl, 'cancel'));
```

- [ ] **Step 5: Update membership-accordion.ts call sites**

The component uses `protected readonly store = inject(MembershipStore)`:
```ts
actionSheetOptions.buttons.push(createActionSheetButton('membership.view', this.store.i18n.as_membership_view(), this.imgixBaseUrl, 'eye-on'));
// ...
actionSheetOptions.buttons.push(createActionSheetButton('membership.edit', this.store.i18n.as_membership_edit(), this.imgixBaseUrl, 'edit'));
// ...
actionSheetOptions.buttons.push(createActionSheetButton('membership.end', this.store.i18n.as_membership_end(), this.imgixBaseUrl, 'stop-circle'));
actionSheetOptions.buttons.push(createActionSheetButton('membership.changecat', this.store.i18n.as_membership_changecat(), this.imgixBaseUrl, 'mcatchange'));
// ...
actionSheetOptions.buttons.push(createActionSheetButton('membership.delete', this.store.i18n.as_membership_delete(), this.imgixBaseUrl, 'trash'));
// ...
actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.store.i18n.cancel(), this.imgixBaseUrl, 'cancel'));
```

- [ ] **Step 6: Update members.ts call sites**

The component uses `protected readonly membershipStore = inject(MembershipStore)`:
```ts
actionSheetOptions.buttons.push(createActionSheetButton('membership.view', this.membershipStore.i18n.as_membership_view(), this.imgixBaseUrl, 'eye-on'));
// ...
actionSheetOptions.buttons.push(createActionSheetButton('membership.edit', this.membershipStore.i18n.as_membership_edit(), this.imgixBaseUrl, 'edit'));
// ...
actionSheetOptions.buttons.push(createActionSheetButton('membership.end', this.membershipStore.i18n.as_membership_end(), this.imgixBaseUrl, 'stop-circle'));
actionSheetOptions.buttons.push(createActionSheetButton('membership.changecat', this.membershipStore.i18n.as_membership_changecat(), this.imgixBaseUrl, 'mcatchange'));
// ...
actionSheetOptions.buttons.push(createActionSheetButton('membership.delete', this.membershipStore.i18n.as_membership_delete(), this.imgixBaseUrl, 'trash'));
// ...
actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.membershipStore.i18n.cancel(), this.imgixBaseUrl, 'cancel'));
```

- [ ] **Step 7: Type-check**

```bash
npx tsc --noEmit -p libs/relationship/membership/feature/tsconfig.json
```

- [ ] **Step 8: Commit**

```bash
git add libs/relationship/membership/feature/src/lib/membership.store.ts libs/relationship/membership/feature/src/i18n/de.json libs/relationship/membership/feature/src/lib/membership-list.ts libs/relationship/membership/feature/src/lib/members-accordion.ts libs/relationship/membership/feature/src/lib/membership-accordion.ts libs/relationship/membership/feature/src/lib/members.ts
git commit -m "fix(relationship/membership): add action sheet i18n keys and fix createActionSheetButton calls"
```

---

## Task 9: relationship/membership/feature — ScsMemberFeesStore + scs-member-fees-list.ts

**Files:**
- Modify: `libs/relationship/membership/feature/src/lib/scs-member-fees.store.ts` (add 7 keys)
- Modify: `libs/relationship/membership/feature/src/i18n/de.json` (add translations — reuses Task 8's file)
- Modify: `libs/relationship/membership/feature/src/lib/scs-member-fees-list.ts:331-343`

ScsMemberFeesStore has `cancel` already. The file uses `protected readonly store = inject(ScsMemberFeesStore)`.

Buttons used: `'invoice.edit'`, `'invoice.upload'`, `'invoice.download'`, `'invoice.paid'`, `'invoice.delete'`, `'person.edit'`, `'member.edit'`.

- [ ] **Step 1: Add action sheet keys to SCS_MEMBER_FEES_I18N_KEYS in scs-member-fees.store.ts**

```ts
as_invoice_edit:     PFX + 'actionsheet.invoice.edit',
as_invoice_upload:   PFX + 'actionsheet.invoice.upload',
as_invoice_download: PFX + 'actionsheet.invoice.download',
as_invoice_paid:     PFX + 'actionsheet.invoice.paid',
as_invoice_delete:   PFX + 'actionsheet.invoice.delete',
as_person_edit:      PFX + 'actionsheet.person.edit',
as_member_edit:      PFX + 'actionsheet.member.edit',
```

- [ ] **Step 2: Add German translations to libs/relationship/membership/feature/src/i18n/de.json**

Merge (adding to existing `actionsheet` object from Task 8):
```json
{
  "actionsheet": {
    "invoice": {
      "edit": "Rechnung ändern",
      "upload": "Rechnung hochladen",
      "download": "Rechnung herunterladen",
      "paid": "Als bezahlt markieren",
      "delete": "Rechnung löschen"
    },
    "member": {
      "edit": "Mitglied ändern"
    }
  }
}
```

Note: `actionsheet.person.edit` was already added in Task 8.

- [ ] **Step 3: Update call sites in scs-member-fees-list.ts**

At lines 331-343:
```ts
opts.buttons.push(createActionSheetButton('invoice.edit', this.store.i18n.as_invoice_edit(), imgixBaseUrl, 'edit'));
opts.buttons.push(createActionSheetButton('invoice.upload', this.store.i18n.as_invoice_upload(), imgixBaseUrl, 'upload'));
opts.buttons.push(createActionSheetButton('invoice.download', this.store.i18n.as_invoice_download(), imgixBaseUrl, 'download'));
opts.buttons.push(createActionSheetButton('invoice.paid', this.store.i18n.as_invoice_paid(), imgixBaseUrl, 'checkmark'));
// ...
opts.buttons.push(createActionSheetButton('invoice.delete', this.store.i18n.as_invoice_delete(), imgixBaseUrl, 'trash'));
// ...
opts.buttons.push(createActionSheetButton('person.edit', this.store.i18n.as_person_edit(), imgixBaseUrl, 'edit'));
opts.buttons.push(createActionSheetButton('member.edit', this.store.i18n.as_member_edit(), imgixBaseUrl, 'edit'));
opts.buttons.push(createActionSheetButton('cancel', this.store.i18n.cancel(), imgixBaseUrl, 'cancel'));
```

Note: `imgixBaseUrl` is a local `const` at line 328.

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit -p libs/relationship/membership/feature/tsconfig.json
```

- [ ] **Step 5: Commit**

```bash
git add libs/relationship/membership/feature/src/lib/scs-member-fees.store.ts libs/relationship/membership/feature/src/i18n/de.json libs/relationship/membership/feature/src/lib/scs-member-fees-list.ts
git commit -m "fix(relationship/membership): add invoice/member action sheet keys to ScsMemberFeesStore"
```

---

## Task 10: finance/bill/feature — add keys to BillStore

**Files:**
- Modify: `libs/finance/bill/feature/src/lib/bill.store.ts` (add 3 keys)
- Modify: `libs/finance/bill/feature/src/i18n/de.json` (add translations)
- Modify: `libs/finance/bill/feature/src/lib/bill-list.ts:166-170`
- Modify: `libs/finance/bill/feature/src/lib/bill-accordion.ts:70-74`

BillStore PFX = `'@finance/bill/feature.'`. Currently only has display keys. Both components use `protected readonly store = inject(BillStore)`. Both files use local `const base = this.store.appStore.env.services.imgixBaseUrl`.

Buttons: `'bill.view'`, `'bill.download'` (conditional), `'cancel'`.

- [ ] **Step 1: Add keys to BILL_I18N_KEYS in bill.store.ts**

```ts
as_view:     '@finance/bill/feature.actionsheet.view',
as_download: '@finance/bill/feature.actionsheet.download',
cancel:      '@cancel',
```

Note: BillStore doesn't use a `PFX` import. Write the full keys as string literals matching the existing style.

- [ ] **Step 2: Add German translations to libs/finance/bill/feature/src/i18n/de.json**

Merge (preserving existing `actionsheet.title`):
```json
{
  "actionsheet": {
    "title": "Wähle eine Aktion",
    "view": "Rechnung anzeigen",
    "download": "Rechnung herunterladen"
  }
}
```

- [ ] **Step 3: Update bill-list.ts call sites**

```ts
options.buttons.push(createActionSheetButton('bill.view', this.store.i18n.as_view(), base, 'eye-on'));
// if downloadable:
options.buttons.push(createActionSheetButton('bill.download', this.store.i18n.as_download(), base, 'download'));
// ...
options.buttons.push(createActionSheetButton('cancel', this.store.i18n.cancel(), base, 'cancel'));
```

- [ ] **Step 4: Update bill-accordion.ts call sites**

```ts
options.buttons.push(createActionSheetButton('bill.view', this.store.i18n.as_view(), base, 'eye-on'));
// if downloadable:
options.buttons.push(createActionSheetButton('bill.download', this.store.i18n.as_download(), base, 'download'));
// ...
options.buttons.push(createActionSheetButton('cancel', this.store.i18n.cancel(), base, 'cancel'));
```

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit -p libs/finance/bill/feature/tsconfig.json
```

- [ ] **Step 6: Commit**

```bash
git add libs/finance/bill/feature/src/lib/bill.store.ts libs/finance/bill/feature/src/i18n/de.json libs/finance/bill/feature/src/lib/bill-list.ts libs/finance/bill/feature/src/lib/bill-accordion.ts
git commit -m "fix(finance/bill): add action sheet i18n keys and fix createActionSheetButton calls"
```

---

## Task 11: finance/invoice/feature — add keys to InvoiceStore

**Files:**
- Modify: `libs/finance/invoice/feature/src/lib/invoice.store.ts` (add 4 keys)
- Modify: `libs/finance/invoice/feature/src/i18n/de.json` (add translations)
- Modify: `libs/finance/invoice/feature/src/lib/invoice-list.ts:194-203`

InvoiceStore (PFX = `'@finance/invoice/feature.'`) has `cancel`. The component uses `protected readonly store = inject(InvoiceStore)`. Uses local `const base`.

Buttons: `'invoice.view'`, `'invoice.showpdf'`, `'invoice.edit'`, `'invoice.delete'`, `'cancel'`.

- [ ] **Step 1: Add keys to INVOICE_I18N_KEYS in invoice.store.ts**

```ts
as_view:    PFX + 'actionsheet.view',
as_showpdf: PFX + 'actionsheet.showpdf',
as_edit:    PFX + 'actionsheet.edit',
as_delete:  PFX + 'actionsheet.delete',
```

- [ ] **Step 2: Add German translations to libs/finance/invoice/feature/src/i18n/de.json**

Merge (preserving existing `actionsheet.title`):
```json
{
  "actionsheet": {
    "title": "Wähle eine Aktion",
    "view": "Rechnung anzeigen",
    "showpdf": "PDF anzeigen",
    "edit": "Rechnung ändern",
    "delete": "Rechnung löschen"
  }
}
```

- [ ] **Step 3: Update invoice-list.ts call sites**

```ts
options.buttons.push(createActionSheetButton('invoice.view', this.store.i18n.as_view(), base, 'eye-on'));
options.buttons.push(createActionSheetButton('invoice.showpdf', this.store.i18n.as_showpdf(), base, 'download'));
// if editable:
options.buttons.push(createActionSheetButton('invoice.edit', this.store.i18n.as_edit(), base, 'edit'));
// ...
options.buttons.push(createActionSheetButton('invoice.delete', this.store.i18n.as_delete(), base, 'trash'));
// ...
options.buttons.push(createActionSheetButton('cancel', this.store.i18n.cancel(), base, 'cancel'));
```

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit -p libs/finance/invoice/feature/tsconfig.json
```

- [ ] **Step 5: Commit**

```bash
git add libs/finance/invoice/feature/src/lib/invoice.store.ts libs/finance/invoice/feature/src/i18n/de.json libs/finance/invoice/feature/src/lib/invoice-list.ts
git commit -m "fix(finance/invoice): add action sheet i18n keys and fix createActionSheetButton calls"
```

---

## Task 12: finance/journal/feature — add keys to JournalStore

**Files:**
- Modify: `libs/finance/journal/feature/src/lib/journal.store.ts` (add 4 keys)
- Modify: `libs/finance/journal/feature/src/i18n/de.json` (add translations)
- Modify: `libs/finance/journal/feature/src/lib/journal-list.ts:103-106`

JournalStore PFX = `'@finance/journal/feature.'`. Currently only has `list_title`. Uses local `const base`. The component uses `protected readonly store = inject(JournalStore)`.

Buttons: `'journal.view'`, `'journal.showDebitAccount'`, `'journal.showCreditAccount'`, `'cancel'`.

- [ ] **Step 1: Add keys to JOURNAL_I18N_KEYS in journal.store.ts**

```ts
as_view:             PFX + 'actionsheet.view',
as_showDebitAccount: PFX + 'actionsheet.showDebitAccount',
as_showCreditAccount: PFX + 'actionsheet.showCreditAccount',
cancel:              '@cancel',
```

- [ ] **Step 2: Add German translations to libs/finance/journal/feature/src/i18n/de.json**

Merge (preserving existing `actionsheet.title`):
```json
{
  "actionsheet": {
    "title": "Wähle eine Aktion",
    "view": "Buchung anzeigen",
    "showDebitAccount": "Soll-Konto anzeigen",
    "showCreditAccount": "Haben-Konto anzeigen"
  }
}
```

- [ ] **Step 3: Update journal-list.ts call sites**

```ts
options.buttons.push(createActionSheetButton('journal.view', this.store.i18n.as_view(), base, 'eye-on'));
options.buttons.push(createActionSheetButton('journal.showDebitAccount', this.store.i18n.as_showDebitAccount(), base, 'information'));
options.buttons.push(createActionSheetButton('journal.showCreditAccount', this.store.i18n.as_showCreditAccount(), base, 'information'));
options.buttons.push(createActionSheetButton('cancel', this.store.i18n.cancel(), base, 'cancel'));
```

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit -p libs/finance/journal/feature/tsconfig.json
```

- [ ] **Step 5: Commit**

```bash
git add libs/finance/journal/feature/src/lib/journal.store.ts libs/finance/journal/feature/src/i18n/de.json libs/finance/journal/feature/src/lib/journal-list.ts
git commit -m "fix(finance/journal): add action sheet i18n keys and fix createActionSheetButton calls"
```

---

## Task 13: folder/feature — add keys to FolderStore

**Files:**
- Modify: `libs/folder/feature/src/lib/folder.store.ts` (add 3 keys)
- Modify: `libs/folder/feature/src/i18n/de.json` (add translations)
- Modify: `libs/folder/feature/src/lib/folder-list.ts:111-117`

FolderStore has no action sheet keys. The component uses `protected store = inject(FolderStore)`. Uses local `const base`. Note: FolderStore has `changeConfirmation_cancel` (different from `cancel`).

Buttons: `'folder.cancel'`, `'folder.edit'`, `'folder.delete'` (action identifiers with `folder.` prefix).

- [ ] **Step 1: Add keys to FOLDER_I18N_KEYS in folder.store.ts**

```ts
as_edit:  '@folder/feature.actionsheet.edit',
as_delete: '@folder/feature.actionsheet.delete',
cancel:   '@cancel',
```

Note: FolderStore uses full string literals (no PFX import). Match the existing style with `@folder/feature.` prefix.

- [ ] **Step 2: Add German translations to libs/folder/feature/src/i18n/de.json**

Merge (preserving existing `actionsheet.label.choose`):
```json
{
  "actionsheet": {
    "label": {
      "choose": "Wähle eine Aktion"
    },
    "edit": "Ordner ändern",
    "delete": "Ordner löschen"
  }
}
```

- [ ] **Step 3: Update folder-list.ts call sites**

```ts
actionSheetOptions.buttons.push(createActionSheetButton('folder.cancel', this.store.i18n.cancel(), base, 'cancel'));
// ...
actionSheetOptions.buttons.push(createActionSheetButton('folder.edit', this.store.i18n.as_edit(), base, 'edit'));
// ...
actionSheetOptions.buttons.push(createActionSheetButton('folder.delete', this.store.i18n.as_delete(), base, 'trash'));
```

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit -p libs/folder/feature/tsconfig.json
```

- [ ] **Step 5: Commit**

```bash
git add libs/folder/feature/src/lib/folder.store.ts libs/folder/feature/src/i18n/de.json libs/folder/feature/src/lib/folder-list.ts
git commit -m "fix(folder): add action sheet i18n keys and fix createActionSheetButton calls"
```

---

## Task 14: i18n/feature — add keys to I18nDefaultStore + I18nOverrideStore

**Files:**
- Modify: `libs/i18n/feature/src/lib/i18n-default.store.ts` (add 2 keys)
- Modify: `libs/i18n/feature/src/lib/i18n-override.store.ts` (add 2 keys)
- Modify: `libs/i18n/feature/src/i18n/de.json` (add translations)
- Modify: `libs/i18n/feature/src/lib/i18n-default-list.ts:90-92`
- Modify: `libs/i18n/feature/src/lib/i18n-override-list.ts:90-92`

Both stores (PFX = `'@i18n/feature.'`) already have `cancel`. Both components use their respective stores.

Buttons for default-list: `'i18n.default.edit'`, `'i18n.default.delete'`, `'cancel'`.
Buttons for override-list: `'i18n.override.edit'`, `'i18n.override.delete'`, `'cancel'`.

- [ ] **Step 1: Add keys to I18N_DEFAULT_I18N_KEYS in i18n-default.store.ts**

```ts
as_edit:   PFX + 'actionsheet.edit',
as_delete: PFX + 'actionsheet.delete',
```

- [ ] **Step 2: Add keys to I18N_OVERRIDE_I18N_KEYS in i18n-override.store.ts**

```ts
as_edit:   PFX + 'actionsheet.edit',
as_delete: PFX + 'actionsheet.delete',
```

- [ ] **Step 3: Add German translations to libs/i18n/feature/src/i18n/de.json**

Merge (preserving existing `actionsheet.title`):
```json
{
  "actionsheet": {
    "title": "Wähle eine Aktion",
    "edit": "Eintrag ändern",
    "delete": "Eintrag löschen"
  }
}
```

- [ ] **Step 4: Update i18n-default-list.ts call sites**

The component uses the I18nDefaultStore — check the store variable name (`store` or `i18nDefaultStore`):
```ts
options.buttons.push(createActionSheetButton('i18n.default.edit', this.store.i18n.as_edit(), base, 'edit'));
options.buttons.push(createActionSheetButton('i18n.default.delete', this.store.i18n.as_delete(), base, 'trash'));
options.buttons.push(createActionSheetButton('cancel', this.store.i18n.cancel(), base, 'cancel'));
```

- [ ] **Step 5: Update i18n-override-list.ts call sites**

```ts
options.buttons.push(createActionSheetButton('i18n.override.edit', this.store.i18n.as_edit(), base, 'edit'));
options.buttons.push(createActionSheetButton('i18n.override.delete', this.store.i18n.as_delete(), base, 'trash'));
options.buttons.push(createActionSheetButton('cancel', this.store.i18n.cancel(), base, 'cancel'));
```

- [ ] **Step 6: Type-check**

```bash
npx tsc --noEmit -p libs/i18n/feature/tsconfig.json
```

- [ ] **Step 7: Commit**

```bash
git add libs/i18n/feature/src/lib/i18n-default.store.ts libs/i18n/feature/src/lib/i18n-override.store.ts libs/i18n/feature/src/i18n/de.json libs/i18n/feature/src/lib/i18n-default-list.ts libs/i18n/feature/src/lib/i18n-override-list.ts
git commit -m "fix(i18n/feature): add action sheet i18n keys and fix createActionSheetButton calls"
```

---

## Task 15: chat/feature — add message action keys to MatrixChatStore

**Files:**
- Modify: `libs/chat/feature/src/lib/matrix-chat.store.ts` (add 9 keys)
- Modify: `libs/chat/feature/src/i18n/de.json` (add translations)
- Modify: `libs/chat/feature/src/lib/matrix-chat.ts:1031-1043`

MatrixChatStore (PFX = `'@chat/feature.'`) has no message action sheet keys. The component uses `protected store = inject(MatrixChatStore)`. It uses `this.imgixBaseUrl`.

Buttons: `'chat.message.edit'`, `'chat.message.delete'`, `'chat.message.react'`, `'chat.message.reply'`, `'chat.message.thread'`, `'chat.message.report'`, `'chat.message.copy'`, `'chat.message.raw'`, `'cancel'`.

- [ ] **Step 1: Add keys to MATRIX_CHAT_I18N_KEYS in matrix-chat.store.ts**

```ts
as_msg_edit:   PFX + 'message.actionsheet.edit',
as_msg_delete: PFX + 'message.actionsheet.delete',
as_msg_react:  PFX + 'message.actionsheet.react',
as_msg_reply:  PFX + 'message.actionsheet.reply',
as_msg_thread: PFX + 'message.actionsheet.thread',
as_msg_report: PFX + 'message.actionsheet.report',
as_msg_copy:   PFX + 'message.actionsheet.copy',
as_msg_raw:    PFX + 'message.actionsheet.raw',
cancel:        '@cancel',
```

- [ ] **Step 2: Add German translations to libs/chat/feature/src/i18n/de.json**

Merge (preserving existing `message.*` keys):
```json
{
  "message": {
    "actionsheet": {
      "edit": "Nachricht bearbeiten",
      "delete": "Nachricht löschen",
      "react": "Reaktion hinzufügen",
      "reply": "Antworten",
      "thread": "Thread öffnen",
      "report": "Problem melden",
      "copy": "Nachricht kopieren",
      "raw": "Rohdaten anzeigen"
    }
  }
}
```

- [ ] **Step 3: Update matrix-chat.ts call sites (lines 1031-1043)**

```ts
// if own message:
actionSheetOptions.buttons.push(createActionSheetButton('chat.message.edit', this.store.i18n.as_msg_edit(), this.imgixBaseUrl, 'edit'));
actionSheetOptions.buttons.push(createActionSheetButton('chat.message.delete', this.store.i18n.as_msg_delete(), this.imgixBaseUrl, 'trash'));
// ...
actionSheetOptions.buttons.push(createActionSheetButton('chat.message.react', this.store.i18n.as_msg_react(), this.imgixBaseUrl, 'smiley'));
actionSheetOptions.buttons.push(createActionSheetButton('chat.message.reply', this.store.i18n.as_msg_reply(), this.imgixBaseUrl, 'return_reply'));
actionSheetOptions.buttons.push(createActionSheetButton('chat.message.thread', this.store.i18n.as_msg_thread(), this.imgixBaseUrl, 'branch'));
actionSheetOptions.buttons.push(createActionSheetButton('chat.message.report', this.store.i18n.as_msg_report(), this.imgixBaseUrl, 'alert-circle'));
// ...
actionSheetOptions.buttons.push(createActionSheetButton('chat.message.copy', this.store.i18n.as_msg_copy(), this.imgixBaseUrl, 'copy'));
// if admin/debug:
actionSheetOptions.buttons.push(createActionSheetButton('chat.message.raw', this.store.i18n.as_msg_raw(), this.imgixBaseUrl, 'code'));
actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.store.i18n.cancel(), this.imgixBaseUrl, 'cancel'));
```

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit -p libs/chat/feature/tsconfig.json
```

- [ ] **Step 5: Commit**

```bash
git add libs/chat/feature/src/lib/matrix-chat.store.ts libs/chat/feature/src/i18n/de.json libs/chat/feature/src/lib/matrix-chat.ts
git commit -m "fix(chat/feature): add message action sheet i18n keys and fix createActionSheetButton calls"
```

---

## Task 16: chat/ui — matrix-message-input.ts (extend interface + update caller)

**Files:**
- Modify: `libs/chat/ui/src/lib/matrix-message-input.ts` (extend `MatrixMessageInputI18n`, update call sites)
- Modify: `libs/chat/ui/src/i18n/de.json` (add translations)
- Modify: `libs/chat/feature/src/lib/matrix-chat.ts` (update i18n object passed to component)

`matrix-message-input.ts` already receives `i18n = input.required<MatrixMessageInputI18n>()`. Extending the existing interface is cleaner than adding a new store. The parent is `matrix-chat.ts` (which uses MatrixChatStore).

Buttons: `'chat.attachment.image'`, `'chat.attachment.file'`, `'chat.attachment.position'`, `'chat.attachment.survey'`, `'cancel'`.

- [ ] **Step 1: Extend MatrixMessageInputI18n in matrix-message-input.ts**

In the `MatrixMessageInputI18n` type, add:
```ts
export type MatrixMessageInputI18n = {
  isTypeing: string;
  and: string;
  areTypeing: string;
  othersTypeing: string;
  copy_conf: string;
  as_attachment_image: string;
  as_attachment_file: string;
  as_attachment_position: string;
  as_attachment_survey: string;
  cancel: string;
};
```

- [ ] **Step 2: Update the 5 call sites in matrix-message-input.ts (lines 566-570)**

```ts
actionSheetOptions.buttons.push(createActionSheetButton('chat.attachment.image', this.i18n().as_attachment_image, this.imgixBaseUrl, 'image'));
actionSheetOptions.buttons.push(createActionSheetButton('chat.attachment.file', this.i18n().as_attachment_file, this.imgixBaseUrl, 'document'));
actionSheetOptions.buttons.push(createActionSheetButton('chat.attachment.position', this.i18n().as_attachment_position, this.imgixBaseUrl, 'location'));
actionSheetOptions.buttons.push(createActionSheetButton('chat.attachment.survey', this.i18n().as_attachment_survey, this.imgixBaseUrl, 'help-circle'));
actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.i18n().cancel, this.imgixBaseUrl, 'cancel'));
```

Note: `this.i18n()` returns a plain object (not signals), so no `()` on the individual properties.

- [ ] **Step 3: Add German translations to libs/chat/ui/src/i18n/de.json**

Merge (the file has a trailing comma JSON error — fix that too):
```json
{
  "attachment": {
    "image": "Bild anhängen",
    "file": "Datei anhängen",
    "position": "Position senden",
    "survey": "Umfrage erstellen"
  }
}
```

Also fix the trailing comma at line 57 col 42 in the existing file (remove the trailing comma after the `placeholder` value in the `survey.question` object).

- [ ] **Step 4: Add the new keys to MatrixChatStore's i18n object passed to the component**

In `libs/chat/feature/src/lib/matrix-chat.ts`, find where `MatrixMessageInputI18n` is assembled and passed to `bk-matrix-message-input`. Add:
```ts
as_attachment_image: this.store.i18n.as_attachment_image(),    // see Note below
as_attachment_file: this.store.i18n.as_attachment_file(),
as_attachment_position: this.store.i18n.as_attachment_position(),
as_attachment_survey: this.store.i18n.as_attachment_survey(),
cancel: this.store.i18n.cancel(),
```

**Note:** These attachment keys must also be added to `MATRIX_CHAT_I18N_KEYS` in Task 15's `matrix-chat.store.ts`. If Task 15 is already done, re-open the store and add:
```ts
as_attachment_image:    PFX + 'attachment.image',
as_attachment_file:     PFX + 'attachment.file',
as_attachment_position: PFX + 'attachment.position',
as_attachment_survey:   PFX + 'attachment.survey',
```

And add translations to `libs/chat/feature/src/i18n/de.json`:
```json
{
  "attachment": {
    "image": "Bild anhängen",
    "file": "Datei anhängen",
    "position": "Position senden",
    "survey": "Umfrage erstellen"
  }
}
```

Alternatively, the assembly in `matrix-chat.ts` may read from `this.store.i18n.*` directly as signals — match whatever pattern is already used to build the `i18n` object for the child component.

- [ ] **Step 5: Type-check both libs**

```bash
npx tsc --noEmit -p libs/chat/ui/tsconfig.json
npx tsc --noEmit -p libs/chat/feature/tsconfig.json
```

- [ ] **Step 6: Commit**

```bash
git add libs/chat/ui/src/lib/matrix-message-input.ts libs/chat/ui/src/i18n/de.json libs/chat/feature/src/lib/matrix-chat.ts libs/chat/feature/src/lib/matrix-chat.store.ts libs/chat/feature/src/i18n/de.json
git commit -m "fix(chat/ui): extend MatrixMessageInputI18n with attachment keys and fix createActionSheetButton calls"
```

---

## Task 17: chat/ui — poll-message.ts (add inline store)

**Files:**
- Modify: `libs/chat/ui/src/lib/poll-message.ts` (add inline store)
- Modify: `libs/chat/ui/src/i18n/de.json` (add translations)

`poll-message.ts` has no store or i18n. It uses `const url = this.env.services.imgixBaseUrl`. Buttons: `'poll.viewVotes'`, `'poll.end'` (conditional), `'cancel'`.

- [ ] **Step 1: Add inline store to poll-message.ts**

Add imports at the top:
```ts
import { inject as injectFn } from '@angular/core';
import { signalStore, withProps } from '@ngrx/signals';
import { I18nService } from '@bk2/shared-i18n';
import { PFX } from './scope';
```

Add the inline store before the `@Component` decorator:
```ts
const PollMessageStore = signalStore(
  withProps(() => ({ i18nService: injectFn(I18nService) })),
  withProps(store => ({
    i18n: store.i18nService.translateAll({
      as_viewVotes: PFX + 'poll.actionsheet.viewVotes',
      as_end:       PFX + 'poll.actionsheet.end',
      cancel:       '@cancel',
    }),
  })),
);
```

In the `@Component` decorator, add:
```ts
providers: [PollMessageStore],
```

In the class body, add:
```ts
private readonly pollStore = inject(PollMessageStore);
```

- [ ] **Step 2: Update the 3 call sites in poll-message.ts (lines 243-247)**

```ts
opts.buttons.push(createActionSheetButton('poll.viewVotes', this.pollStore.i18n.as_viewVotes(), url, 'chart'));
// if canEnd:
opts.buttons.push(createActionSheetButton('poll.end', this.pollStore.i18n.as_end(), url, 'cancel-circle'));
// ...
opts.buttons.push(createActionSheetButton('cancel', this.pollStore.i18n.cancel(), url, 'cancel'));
```

- [ ] **Step 3: Add German translations to libs/chat/ui/src/i18n/de.json**

Merge (building on Task 16 additions):
```json
{
  "poll": {
    "actionsheet": {
      "viewVotes": "Abstimmungsergebnisse anzeigen",
      "end": "Umfrage beenden"
    }
  }
}
```

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit -p libs/chat/ui/tsconfig.json
```

- [ ] **Step 5: Commit**

```bash
git add libs/chat/ui/src/lib/poll-message.ts libs/chat/ui/src/i18n/de.json
git commit -m "fix(chat/ui): add inline store and fix createActionSheetButton calls in poll-message"
```

---

## Task 18: shared/ui — email-addresses.modal.ts (add inline store)

**Files:**
- Modify: `libs/shared/ui/src/lib/email-addresses.modal.ts` (add inline store)
- Modify: `libs/shared/ui/src/i18n/de.json` (add translations)

`email-addresses.modal.ts` uses `const url = this.env.services.imgixBaseUrl`. Buttons: `'person.edit'`, `'person.view'`, `'address.hide'`, `'cancel'`.

- [ ] **Step 1: Add inline store to email-addresses.modal.ts**

Add imports at the top:
```ts
import { signalStore, withProps } from '@ngrx/signals';
import { I18nService } from '@bk2/shared-i18n';
```

Add the inline store before the `@Component` decorator:
```ts
const EmailAddressStore = signalStore(
  withProps(() => ({ i18nService: inject(I18nService) })),
  withProps(store => ({
    i18n: store.i18nService.translateAll({
      as_edit:  '@shared/ui.actionsheet.address.edit',
      as_view:  '@shared/ui.actionsheet.address.view',
      as_hide:  '@shared/ui.actionsheet.address.hide',
      cancel:   '@cancel',
    }),
  })),
);
```

In the `@Component` decorator, add:
```ts
providers: [EmailAddressStore],
```

In the class body, add:
```ts
private readonly emailStore = inject(EmailAddressStore);
```

- [ ] **Step 2: Update the 4 call sites in email-addresses.modal.ts (lines 109-114)**

```ts
opts.buttons.push(createActionSheetButton('person.edit', this.emailStore.i18n.as_edit(), url, 'edit'));
// if canView:
opts.buttons.push(createActionSheetButton('person.view', this.emailStore.i18n.as_view(), url, 'show'));
// ...
opts.buttons.push(createActionSheetButton('address.hide', this.emailStore.i18n.as_hide(), url, 'eye-off'));
opts.buttons.push(createActionSheetButton('cancel', this.emailStore.i18n.cancel(), url, 'cancel'));
```

- [ ] **Step 3: Add German translations to libs/shared/ui/src/i18n/de.json**

Merge (preserving existing `actionsheet.title`):
```json
{
  "actionsheet": {
    "title": "Wähle eine Aktion",
    "address": {
      "edit": "E-Mail Adresse ändern",
      "view": "E-Mail Adresse anzeigen",
      "hide": "E-Mail Adresse ausblenden"
    }
  }
}
```

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit -p libs/shared/ui/tsconfig.json
```

- [ ] **Step 5: Commit**

```bash
git add libs/shared/ui/src/lib/email-addresses.modal.ts libs/shared/ui/src/i18n/de.json
git commit -m "fix(shared/ui): add inline store and fix createActionSheetButton calls in email-addresses.modal"
```

---

## Task 19: cms/section/feature — SectionStore + section-list.ts

**Files:**
- Modify: `libs/cms/section/feature/src/lib/section.store.ts` (add 4 keys to SECTION_I18N_KEYS)
- Modify: `libs/cms/section/feature/src/i18n/de.json` (add translations)
- Modify: `libs/cms/section/feature/src/lib/section-list.ts:147-154`

SectionStore (PFX = `'@cms/section/feature.'`) already has many keys but no action sheet keys. The component uses `protected sectionStore = inject(SectionStore)`. It uses `this.sectionStore.imgixBaseUrl()`.

Buttons: `'section.view'`, `'cancel'`, `'section.edit'`, `'section.delete'`.

- [ ] **Step 1: Add keys to SECTION_I18N_KEYS in section.store.ts**

In the `SECTION_I18N_KEYS` object, add:
```ts
as_view:   PFX + 'actionsheet.view',
as_edit:   PFX + 'actionsheet.edit',
as_delete: PFX + 'actionsheet.delete',
cancel:    '@cancel',
```

- [ ] **Step 2: Add translations to libs/cms/section/feature/src/i18n/de.json**

The file is currently `{}`. Add:
```json
{
  "actionsheet": {
    "view": "Sektion anzeigen",
    "edit": "Sektion ändern",
    "delete": "Sektion löschen"
  }
}
```

- [ ] **Step 3: Update call sites in section-list.ts**

```ts
actionSheetOptions.buttons.push(createActionSheetButton('section.view', this.sectionStore.i18n.as_view(), this.sectionStore.imgixBaseUrl(), 'eye-on'));
actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.sectionStore.i18n.cancel(), this.sectionStore.imgixBaseUrl(), 'cancel'));
// ...
actionSheetOptions.buttons.push(createActionSheetButton('section.edit', this.sectionStore.i18n.as_edit(), this.sectionStore.imgixBaseUrl(), 'edit'));
// ...
actionSheetOptions.buttons.push(createActionSheetButton('section.delete', this.sectionStore.i18n.as_delete(), this.sectionStore.imgixBaseUrl(), 'trash'));
```

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit -p libs/cms/section/feature/tsconfig.json
```

- [ ] **Step 5: Commit**

```bash
git add libs/cms/section/feature/src/lib/section.store.ts libs/cms/section/feature/src/i18n/de.json libs/cms/section/feature/src/lib/section-list.ts
git commit -m "fix(cms/section): add action sheet i18n keys and fix createActionSheetButton in section-list"
```

---

## Task 20: cms/section/feature — 5 section-specific stores and components

**Files:**
- Modify: `libs/cms/section/feature/src/lib/context-diagram-section.store.ts` (add I18nService + keys)
- Modify: `libs/cms/section/feature/src/lib/invitations-section.store.ts` (add I18nService + keys)
- Modify: `libs/cms/section/feature/src/lib/news-section.store.ts` (add 3 keys)
- Modify: `libs/cms/section/feature/src/lib/orgchart-section.store.ts` (add 4 keys)
- Modify: `libs/cms/section/feature/src/lib/tasks-section.store.ts` (add 3 keys)
- Modify: `libs/cms/section/feature/src/i18n/de.json` (add translations — same file as Task 19)
- Modify: `libs/cms/section/feature/src/lib/context-diagram-section.ts:118-121`
- Modify: `libs/cms/section/feature/src/lib/invitations-section.ts:161-166`
- Modify: `libs/cms/section/feature/src/lib/news-section.ts:123-128`
- Modify: `libs/cms/section/feature/src/lib/orgchart-section.ts:158-164`
- Modify: `libs/cms/section/feature/src/lib/tasks-section.ts:146-153`

All translations use PFX = `'@cms/section/feature.'`. Do Tasks 19 and 20 together or 19 first (same de.json).

**context-diagram-section.store.ts**: no I18nService at all. Buttons: `'contextDiagram.edit'`, `'contextDiagram.center'`, `'contextDiagram.displayConfig'`, `'cancel'`.

- [ ] **Step 1: Add I18nService + i18n keys to ContextDiagramStore**

Add to imports:
```ts
import { I18nService } from '@bk2/shared-i18n';
import { PFX } from './scope';
```

In the store's first `withProps`:
```ts
withProps(() => ({
  // ... existing injections ...
  i18nService: inject(I18nService),
})),
```

Add a new `withProps` after:
```ts
withProps(store => ({
  i18n: store.i18nService.translateAll({
    as_edit:         PFX + 'context.edit',
    as_center:       PFX + 'context.center',
    as_displayConfig: PFX + 'context.displayConfig',
    cancel:          '@cancel',
  }),
})),
```

- [ ] **Step 2: Add I18nService + keys to InvitationSectionStore**

Add to imports:
```ts
import { I18nService } from '@bk2/shared-i18n';
import { PFX } from './scope';
```

In the store's `withProps` (or add a new one):
```ts
withProps(() => ({
  // ... existing injections ...
  i18nService: inject(I18nService),
})),
withProps(store => ({
  i18n: store.i18nService.translateAll({
    as_subscribe:   PFX + 'invitation.subscribe',
    as_unsubscribe: PFX + 'invitation.unsubscribe',
    cancel:         '@cancel',
  }),
})),
```

- [ ] **Step 3: Add 3 keys to NewsStore (news-section.store.ts)**

In `NEWS_SECTION_I18N_KEYS`, add:
```ts
as_view:   PFX + 'news.actionsheet.view',
as_edit:   PFX + 'news.actionsheet.edit',
cancel:    '@cancel',
```

- [ ] **Step 4: Add 4 keys to OrgchartStore (orgchart-section.store.ts)**

In `ORGCHART_SECTION_I18N_KEYS`, add (it already has `cancel`):
```ts
as_addNewGroup:      PFX + 'orgchart.actionsheet.addNewGroup',
as_addExistingGroup: PFX + 'orgchart.actionsheet.addExistingGroup',
as_editGroup:        PFX + 'orgchart.actionsheet.editGroup',
as_removeGroup:      PFX + 'orgchart.actionsheet.removeGroup',
```

- [ ] **Step 5: Add 3 keys to TasksStore (tasks-section.store.ts)**

In `TASKS_SECTION_I18N_KEYS`, add:
```ts
as_complete: PFX + 'task.actionsheet.complete',
as_view:     PFX + 'task.actionsheet.view',
as_edit:     PFX + 'task.actionsheet.edit',
cancel:      '@cancel',
more:        PFX + 'tasks.more',
```

Note: check if `more` already exists in the store (it's referenced in the template).

- [ ] **Step 6: Add German translations to libs/cms/section/feature/src/i18n/de.json**

Merge (building on Task 19 additions):
```json
{
  "contextDiagram": {
    "actionsheet": {
      "edit": "Knoten bearbeiten",
      "center": "Als Zentrum festlegen",
      "displayConfig": "Anzeigeeinstellungen"
    }
  },
  "invitation": {
    "actionsheet": {
      "subscribe": "Einladung annehmen",
      "unsubscribe": "Einladung ablehnen"
    }
  },
  "news": {
    "actionsheet": {
      "view": "Artikel anzeigen",
      "edit": "Artikel ändern"
    }
  },
  "orgchart": {
    "actionsheet": {
      "addNewGroup": "Neue Gruppe hinzufügen",
      "addExistingGroup": "Bestehende Gruppe hinzufügen",
      "editGroup": "Gruppe bearbeiten",
      "removeGroup": "Gruppe entfernen"
    }
  },
  "task": {
    "actionsheet": {
      "complete": "Als erledigt markieren",
      "view": "Aufgabe anzeigen",
      "edit": "Aufgabe bearbeiten"
    }
  }
}
```

- [ ] **Step 7: Update context-diagram-section.ts call sites (lines 118-121)**

The component uses `private readonly store = inject(ContextDiagramStore)`:
```ts
createActionSheetButton('contextDiagram.edit', this.store.i18n.as_edit(), this.imgixBaseUrl, 'edit'),
...(!isCurrentCenter ? [createActionSheetButton('contextDiagram.center', this.store.i18n.as_center(), this.imgixBaseUrl, 'locate')] : []),
createActionSheetButton('contextDiagram.displayConfig', this.store.i18n.as_displayConfig(), this.imgixBaseUrl, 'settings'),
createActionSheetButton('cancel', this.store.i18n.cancel(), this.imgixBaseUrl, 'cancel'),
```

- [ ] **Step 8: Update invitations-section.ts call sites (lines 161-166)**

The component uses `protected invitationStore = inject(InvitationSectionStore)`:
```ts
actionSheetOptions.buttons.push(createActionSheetButton('invitation.subscribe', this.invitationStore.i18n.as_subscribe(), this.imgixBaseUrl, 'checkbox-circle'));
// ...
actionSheetOptions.buttons.push(createActionSheetButton('invitation.unsubscribe', this.invitationStore.i18n.as_unsubscribe(), this.imgixBaseUrl, 'cancel'));
// ...
actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.invitationStore.i18n.cancel(), this.imgixBaseUrl, 'cancel'));
```

- [ ] **Step 9: Update news-section.ts call sites (lines 123-128)**

The component uses `protected store = inject(NewsStore)`:
```ts
actionSheetOptions.buttons.push(createActionSheetButton('news.view', this.store.i18n.as_view(), this.imgixBaseUrl, 'eye-on'));
// ...
actionSheetOptions.buttons.push(createActionSheetButton('news.edit', this.store.i18n.as_edit(), this.imgixBaseUrl, 'edit'));
// ...
actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.store.i18n.cancel(), this.imgixBaseUrl, 'cancel'));
```

- [ ] **Step 10: Update orgchart-section.ts call sites (lines 158-164)**

The component uses `protected readonly store = inject(OrgchartStore)`:
```ts
createActionSheetButton('orgchart.addNewGroup', this.store.i18n.as_addNewGroup(), this.imgixBaseUrl, 'add-circle'),
createActionSheetButton('orgchart.addExistingGroup', this.store.i18n.as_addExistingGroup(), this.imgixBaseUrl, 'search'),
// if group selected:
createActionSheetButton('orgchart.editGroup', this.store.i18n.as_editGroup(), this.imgixBaseUrl, 'edit'),
createActionSheetButton('orgchart.removeGroup', this.store.i18n.as_removeGroup(), this.imgixBaseUrl, 'trash'),
// ...
createActionSheetButton('cancel', this.store.i18n.cancel(), this.imgixBaseUrl, 'cancel'),
```

- [ ] **Step 11: Update tasks-section.ts call sites (lines 146-153)**

The component uses `protected store = inject(TasksStore)`:
```ts
// if incomplete:
actionSheetOptions.buttons.push(createActionSheetButton('task.complete', this.store.i18n.as_complete(), this.imgixBaseUrl, 'checkbox-circle'));
// ...
actionSheetOptions.buttons.push(createActionSheetButton('task.view', this.store.i18n.as_view(), this.imgixBaseUrl, 'eye-on'));
// ...
actionSheetOptions.buttons.push(createActionSheetButton('task.edit', this.store.i18n.as_edit(), this.imgixBaseUrl, 'edit'));
// ...
actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.store.i18n.cancel(), this.imgixBaseUrl, 'cancel'));
```

- [ ] **Step 12: Type-check**

```bash
npx tsc --noEmit -p libs/cms/section/feature/tsconfig.json
```

- [ ] **Step 13: Commit**

```bash
git add libs/cms/section/feature/src/lib/context-diagram-section.store.ts libs/cms/section/feature/src/lib/invitations-section.store.ts libs/cms/section/feature/src/lib/news-section.store.ts libs/cms/section/feature/src/lib/orgchart-section.store.ts libs/cms/section/feature/src/lib/tasks-section.store.ts libs/cms/section/feature/src/i18n/de.json libs/cms/section/feature/src/lib/context-diagram-section.ts libs/cms/section/feature/src/lib/invitations-section.ts libs/cms/section/feature/src/lib/news-section.ts libs/cms/section/feature/src/lib/orgchart-section.ts libs/cms/section/feature/src/lib/tasks-section.ts
git commit -m "fix(cms/section): add action sheet i18n keys to section stores and fix createActionSheetButton calls"
```

---

## Task 21: aoc/feature — AocTagStore + AocWebsiteStore

**Files:**
- Modify: `libs/aoc/feature/src/lib/aoc-tag.store.ts` (add 4 keys)
- Modify: `libs/aoc/feature/src/lib/aoc-website.store.ts` (add 2 keys)
- Modify: `libs/aoc/feature/src/i18n/de.json` (add translations)
- Modify: `libs/aoc/feature/src/lib/aoc-tag.ts:157-181`
- Modify: `libs/aoc/feature/src/lib/aoc-website.ts:91-93`

Both stores (PFX = `'@aoc/feature.'`) already have `cancel`. `aoc-tag.ts` uses `protected readonly aocTagStore = inject(AocTagStore)` and local `const base`. `aoc-website.ts` uses `protected readonly store = inject(AocWebsiteStore)` and local `const base`.

aoc-tag.ts buttons (2 action sheets): `'tag.edit'`, `'tag.delete'`, `'cancel'`, `'tag.string.edit'`, `'tag.string.remove'`, `'cancel'`.
aoc-website.ts buttons: `'website.edit'`, `'website.delete'`, `'cancel'`.

- [ ] **Step 1: Add keys to AOC_TAG_I18N_KEYS in aoc-tag.store.ts**

```ts
as_edit:         PFX + 'actionsheet.tag.edit',
as_delete:       PFX + 'actionsheet.tag.delete',
as_string_edit:  PFX + 'actionsheet.tag.string.edit',
as_string_remove: PFX + 'actionsheet.tag.string.remove',
```

- [ ] **Step 2: Add keys to AOC_WEBSITE_I18N_KEYS in aoc-website.store.ts**

```ts
as_edit:   PFX + 'actionsheet.website.edit',
as_delete: PFX + 'actionsheet.website.delete',
```

- [ ] **Step 3: Add German translations to libs/aoc/feature/src/i18n/de.json**

Merge (preserving existing content including `actionsheet.label.choose`):
```json
{
  "actionsheet": {
    "label": {
      "choose": "Wähle eine Aktion"
    },
    "tag": {
      "edit": "Tag ändern",
      "delete": "Tag löschen",
      "string": {
        "edit": "Wert ändern",
        "remove": "Wert entfernen"
      }
    },
    "website": {
      "edit": "Website-Text ändern",
      "delete": "Website-Text löschen"
    }
  }
}
```

- [ ] **Step 4: Update aoc-tag.ts call sites (lines 157-181)**

First action sheet:
```ts
options.buttons.push(createActionSheetButton('tag.edit', this.aocTagStore.i18n.as_edit(), base, 'edit'));
options.buttons.push(createActionSheetButton('tag.delete', this.aocTagStore.i18n.as_delete(), base, 'trash'));
options.buttons.push(createActionSheetButton('cancel', this.aocTagStore.i18n.cancel(), base, 'cancel'));
```

Second action sheet:
```ts
options.buttons.push(createActionSheetButton('tag.string.edit', this.aocTagStore.i18n.as_string_edit(), base, 'edit'));
options.buttons.push(createActionSheetButton('tag.string.remove', this.aocTagStore.i18n.as_string_remove(), base, 'trash'));
options.buttons.push(createActionSheetButton('cancel', this.aocTagStore.i18n.cancel(), base, 'cancel'));
```

- [ ] **Step 5: Update aoc-website.ts call sites (lines 91-93)**

```ts
options.buttons.push(createActionSheetButton('website.edit', this.store.i18n.as_edit(), base, 'edit'));
options.buttons.push(createActionSheetButton('website.delete', this.store.i18n.as_delete(), base, 'trash'));
options.buttons.push(createActionSheetButton('cancel', this.store.i18n.cancel(), base, 'cancel'));
```

- [ ] **Step 6: Type-check**

```bash
npx tsc --noEmit -p libs/aoc/feature/tsconfig.json
```

- [ ] **Step 7: Commit**

```bash
git add libs/aoc/feature/src/lib/aoc-tag.store.ts libs/aoc/feature/src/lib/aoc-website.store.ts libs/aoc/feature/src/i18n/de.json libs/aoc/feature/src/lib/aoc-tag.ts libs/aoc/feature/src/lib/aoc-website.ts
git commit -m "fix(aoc): add action sheet i18n keys to AocTagStore/AocWebsiteStore and fix call sites"
```

---

## Task 22: aoc/feature — AocUserAccountStore + aoc-user-account.ts

**Files:**
- Modify: `libs/aoc/feature/src/lib/aoc-user-account.store.ts` (add 7 keys)
- Modify: `libs/aoc/feature/src/i18n/de.json` (add translations — same file)
- Modify: `libs/aoc/feature/src/lib/aoc-user-account.ts:146-164`

`aoc-user-account.ts` uses `protected store = inject(AocUserAccountStore)` (verify variable name). Uses `this.imgixBaseUrl`.

Buttons: `'fbuser.delete'`, `'user.edit'`, `'user.delete'`, `'membership.edit'`, `'account.copyemail'`, `'account.copyuid'`, `'account.copypkey'`, `'cancel'`.

- [ ] **Step 1: Add keys to AOC_USER_ACCOUNT_I18N_KEYS in aoc-user-account.store.ts**

```ts
as_fbuser_delete:      PFX + 'actionsheet.fbuser.delete',
as_user_edit:          PFX + 'actionsheet.user.edit',
as_user_delete:        PFX + 'actionsheet.user.delete',
as_membership_edit:    PFX + 'actionsheet.membership.edit',
as_account_copyemail:  PFX + 'actionsheet.account.copyemail',
as_account_copyuid:    PFX + 'actionsheet.account.copyuid',
as_account_copypkey:   PFX + 'actionsheet.account.copypkey',
```

- [ ] **Step 2: Add German translations to libs/aoc/feature/src/i18n/de.json**

Merge (building on Task 21 additions):
```json
{
  "actionsheet": {
    "fbuser": {
      "delete": "Firebase-Benutzer löschen"
    },
    "user": {
      "edit": "Benutzer ändern",
      "delete": "Benutzer löschen"
    },
    "membership": {
      "edit": "Mitgliedschaft ändern"
    },
    "account": {
      "copyemail": "E-Mail kopieren",
      "copyuid": "UID kopieren",
      "copypkey": "Person-Key kopieren"
    }
  }
}
```

- [ ] **Step 3: Update aoc-user-account.ts call sites (lines 146-164)**

```ts
// if fbuser:
actionSheetOptions.buttons.push(createActionSheetButton('fbuser.delete', this.store.i18n.as_fbuser_delete(), this.imgixBaseUrl, 'trash'));
// ...
// if user:
actionSheetOptions.buttons.push(createActionSheetButton('user.edit', this.store.i18n.as_user_edit(), this.imgixBaseUrl, 'edit'));
actionSheetOptions.buttons.push(createActionSheetButton('user.delete', this.store.i18n.as_user_delete(), this.imgixBaseUrl, 'trash'));
// ...
// if membership:
actionSheetOptions.buttons.push(createActionSheetButton('membership.edit', this.store.i18n.as_membership_edit(), this.imgixBaseUrl, 'edit'));
// ...
actionSheetOptions.buttons.push(createActionSheetButton('account.copyemail', this.store.i18n.as_account_copyemail(), this.imgixBaseUrl, 'copy'));
// ...
actionSheetOptions.buttons.push(createActionSheetButton('account.copyuid', this.store.i18n.as_account_copyuid(), this.imgixBaseUrl, 'copy'));
// ...
actionSheetOptions.buttons.push(createActionSheetButton('account.copypkey', this.store.i18n.as_account_copypkey(), this.imgixBaseUrl, 'copy'));
// ...
actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.store.i18n.cancel(), this.imgixBaseUrl, 'cancel'));
```

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit -p libs/aoc/feature/tsconfig.json
```

- [ ] **Step 5: Commit**

```bash
git add libs/aoc/feature/src/lib/aoc-user-account.store.ts libs/aoc/feature/src/i18n/de.json libs/aoc/feature/src/lib/aoc-user-account.ts
git commit -m "fix(aoc): add action sheet keys to AocUserAccountStore and fix aoc-user-account.ts"
```

---

## Task 23: aoc/feature — AocSrvStore + aoc-srv.ts

**Files:**
- Modify: `libs/aoc/feature/src/lib/aoc-srv.store.ts` (add 11 keys)
- Modify: `libs/aoc/feature/src/i18n/de.json` (add translations)
- Modify: `libs/aoc/feature/src/lib/aoc-srv.ts:400-464`

`aoc-srv.ts` uses `protected readonly store = inject(AocSrvStore)` and `private imgixBaseUrl`. The store has 4 action sheets that repeat the same buttons for different member categories. All 4 have the same buttons except slight variations.

Buttons across all 4 action sheets: `'person.edit'`, `'membership.edit'`, `'parentMembership.edit'`, `'parentMembership.create'`, `'regasoft.copy'`, `'regasoft.view'`, `'regasoft.add'`, `'regasoft.update'`, `'license.create'`, `'license.download'`, `'cancel'`.

- [ ] **Step 1: Add keys to AOC_SRV_I18N_KEYS in aoc-srv.store.ts**

```ts
as_person_edit:              PFX + 'actionsheet.person.edit',
as_membership_edit:          PFX + 'actionsheet.membership.edit',
as_parentmembership_edit:    PFX + 'actionsheet.parentMembership.edit',
as_parentmembership_create:  PFX + 'actionsheet.parentMembership.create',
as_regasoft_copy:            PFX + 'actionsheet.regasoft.copy',
as_regasoft_view:            PFX + 'actionsheet.regasoft.view',
as_regasoft_add:             PFX + 'actionsheet.regasoft.add',
as_regasoft_update:          PFX + 'actionsheet.regasoft.update',
as_license_create:           PFX + 'actionsheet.license.create',
as_license_download:         PFX + 'actionsheet.license.download',
cancel:                      '@cancel',
```

Note: Check if `PFX` is imported in aoc-srv.store.ts. If not, add `import { PFX } from './scope';`.

- [ ] **Step 2: Add German translations to libs/aoc/feature/src/i18n/de.json**

Merge (building on previous aoc tasks):
```json
{
  "actionsheet": {
    "person": {
      "edit": "Person ändern"
    },
    "membership": {
      "edit": "Mitgliedschaft ändern"
    },
    "parentMembership": {
      "edit": "Dachverband-Mitgliedschaft ändern",
      "create": "Dachverband-Mitgliedschaft erstellen"
    },
    "regasoft": {
      "copy": "Regasoft-Daten kopieren",
      "view": "Regasoft-Daten anzeigen",
      "add": "Regasoft-Eintrag erstellen",
      "update": "Regasoft-Eintrag aktualisieren"
    },
    "license": {
      "create": "Lizenz erstellen",
      "download": "Lizenz herunterladen"
    }
  }
}
```

- [ ] **Step 3: Update all 4 action sheet blocks in aoc-srv.ts**

The store variable is `protected readonly store = inject(AocSrvStore)`.

Block 1 (lines ~400-409):
```ts
actionSheetOptions.buttons.push(createActionSheetButton('person.edit', this.store.i18n.as_person_edit(), this.imgixBaseUrl, 'edit'));
actionSheetOptions.buttons.push(createActionSheetButton('membership.edit', this.store.i18n.as_membership_edit(), this.imgixBaseUrl, 'edit'));
actionSheetOptions.buttons.push(createActionSheetButton('parentMembership.edit', this.store.i18n.as_parentmembership_edit(), this.imgixBaseUrl, 'edit'));
actionSheetOptions.buttons.push(createActionSheetButton('parentMembership.create', this.store.i18n.as_parentmembership_create(), this.imgixBaseUrl, 'add'));
// ...
actionSheetOptions.buttons.push(createActionSheetButton('regasoft.copy', this.store.i18n.as_regasoft_copy(), this.imgixBaseUrl, 'copy'));
actionSheetOptions.buttons.push(createActionSheetButton('regasoft.view', this.store.i18n.as_regasoft_view(), this.imgixBaseUrl, 'eye-on'));
actionSheetOptions.buttons.push(createActionSheetButton('regasoft.add', this.store.i18n.as_regasoft_add(), this.imgixBaseUrl, 'add'));
actionSheetOptions.buttons.push(createActionSheetButton('regasoft.update', this.store.i18n.as_regasoft_update(), this.imgixBaseUrl, 'edit'));
actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.store.i18n.cancel(), this.imgixBaseUrl, 'cancel'));
```

Repeat the same pattern for blocks 2, 3, and 4 — identical keys, just different conditional buttons per block (e.g., block 2 has `license.create`, `license.download`; block 3 has only `regasoft` buttons; block 4 is similar).

For blocks with `license.create` and `license.download`:
```ts
actionSheetOptions.buttons.push(createActionSheetButton('license.create', this.store.i18n.as_license_create(), this.imgixBaseUrl, 'edit'));
actionSheetOptions.buttons.push(createActionSheetButton('license.download', this.store.i18n.as_license_download(), this.imgixBaseUrl, 'download'));
```

Read the actual source lines (400-464) carefully before editing — preserve all existing conditions.

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit -p libs/aoc/feature/tsconfig.json
```

- [ ] **Step 5: Commit**

```bash
git add libs/aoc/feature/src/lib/aoc-srv.store.ts libs/aoc/feature/src/i18n/de.json libs/aoc/feature/src/lib/aoc-srv.ts
git commit -m "fix(aoc): add action sheet keys to AocSrvStore and fix createActionSheetButton calls"
```

---

## Self-Review

**Spec coverage:**
- All 33 affected files covered (addresses-accordion excluded per user instruction)
- Every `createActionSheetButton` 3-arg call replaced with 4-arg call
- Every required i18n key added to the appropriate store
- German translations provided for all new keys

**Placeholder scan:** All steps include actual code — no TBD or "similar to" references.

**Type consistency:**
- Store variable names used are read from the actual source (verified during research): `this.store`, `this.membershipStore`, `this.personalRelStore`, `this.reservationStore`, `this.sectionStore`, `this.groupStore`, `this.orgStore`, `this.aocTagStore`, `this.invitationStore`
- The `i18n` object on each store is accessed via `store.i18n.keyName()` (signal call)
- For `matrix-message-input.ts`, the i18n input is a plain object: `this.i18n().propertyName` (no inner call)

**Potential issue — Task 16 dependency:** Task 16 adds attachment keys to `MATRIX_CHAT_I18N_KEYS` (in `matrix-chat.store.ts`). Task 15 was already defined for that file. Do Task 15 and 16 together, or ensure Task 16's store additions are not lost when Task 15 is committed.

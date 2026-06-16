# Booking Counterparty & Config-Driven Booking Actions — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a booking carry its external counterparty (person or org) and offer config-driven per-booking actions, starting with a *Gönnerbestätigung* PDF for gss / account `3407`.

**Architecture:** Add `BookingModel.counterparty: AvatarInfo`. A typed `BOOKING_ACTIONS` registry (discriminated union) in `finance-booking-util` maps `(accountingTenantId, accountId) → action`; `BookingStore` matches a booking's accounts against it and dispatches on action `type`. The first variant, `generateDocument`, resolves the counterparty's name/address into a payload and calls the existing `generateDocument` Cloud Function via `DocGenerationService`. A seed script publishes the Handlebars template to Firestore.

**Tech Stack:** Angular 20 (zoneless, signals), NgRx Signal Store, Ionic, Firebase/Firestore, Vitest, Handlebars (server-side, in the Cloud Function), firebase-admin (seed script).

**Design reference:** [`../specs/2026-06-16-booking-counterparty-actions-design.md`](../specs/2026-06-16-booking-counterparty-actions-design.md)

---

## File structure

| File | Responsibility | Action |
|------|----------------|--------|
| `libs/shared/models/src/lib/booking.model.ts` | add `counterparty` field | modify |
| `libs/finance/booking/util/src/lib/booking-action.model.ts` | `BookingTrigger`, `BookingAction` union | create |
| `libs/finance/booking/util/src/lib/booking-actions.ts` | `BOOKING_ACTIONS` registry | create |
| `libs/finance/booking/util/src/lib/booking-action.util.ts` | `matchActions`, `buildReceiptPayload` (pure) | create |
| `libs/finance/booking/util/src/lib/booking-action.util.spec.ts` | unit tests for the two pure fns | create |
| `libs/finance/booking/util/src/index.ts` | export the new symbols | modify |
| `libs/finance/booking/util/src/lib/booking-i18n.ts` | action label + hint i18n keys | modify |
| `libs/finance/booking/feature/src/i18n/de.json` | German strings | modify (create if absent) |
| `libs/subject/address/data-access/src/lib/address.service.ts` | `getFavoritePostalAddress(parentKey)` | modify |
| `libs/finance/booking/feature/src/lib/booking.store.ts` | `linesByBooking`, `availableActions`, `runAction`, `selectCounterparty` | modify |
| `libs/finance/booking/feature/src/lib/booking-edit.modal.ts` | counterparty picker (`bk-avatar-select`) | modify |
| `libs/finance/booking/feature/src/lib/booking-list.ts` | per-item ActionSheet | modify |
| `scripts/templates/gss-spendenbestaetigung.hbs` | template source under version control | create |
| `scripts/seed-gss-spendenbestaetigung.mjs` | seed TemplateModel + version into Firestore | create |

Dependency note: `finance-booking-util` already depends on `@bk2/shared-models` and `@bk2/shared-util-core`. The new util functions are **pure** (they take already-resolved `PersonModel`/`OrgModel`/`AddressModel` objects), so no service dependency is added to `util`. Verify `tsconfig.json` of `finance-booking-util` lists `@bk2/shared-models` and `@bk2/shared-util-core` as references (it does today); no new reference needed.

---

## Task 1: Add `counterparty` to `BookingModel`

**Files:**
- Modify: `libs/shared/models/src/lib/booking.model.ts`

- [ ] **Step 1: Add the field and import**

In `libs/shared/models/src/lib/booking.model.ts`, change the import line:

```ts
import { BkModel, SearchableModel, TaggedModel } from './base.model';
import { AvatarInfo } from './avatar-info';
```

Add the field right after `accountingTenantId`:

```ts
  public accountingTenantId = '';        // = org.bkey of the accounting tenant
  public counterparty: AvatarInfo | undefined;  // external party of the booking (Gutschrift sender, donor, invoice receiver)
```

- [ ] **Step 2: Type-check shared-models**

Run: `npx tsc --noEmit -p libs/shared/models/tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add libs/shared/models/src/lib/booking.model.ts
git commit -m "feat(models): add counterparty to BookingModel"
```

---

## Task 2: Action descriptor types

**Files:**
- Create: `libs/finance/booking/util/src/lib/booking-action.model.ts`

- [ ] **Step 1: Create the union types**

```ts
// libs/finance/booking/util/src/lib/booking-action.model.ts

/** Matches a booking by its accounting tenant and an account number present on its lines. */
export interface BookingTrigger {
  accountingTenantId: string;   // = BookingModel.accountingTenantId
  accountId: string;            // = AccountModel.id (account number, e.g. '3407')
}

interface BaseBookingAction {
  id: string;          // stable, unique, e.g. 'gss-spende-receipt'
  labelKey: string;    // i18n key shown in the ActionSheet
  icon: string;        // svgIcon name
  trigger: BookingTrigger;
}

/** Generate a document from a published template and open it. */
export interface GenerateDocumentAction extends BaseBookingAction {
  type: 'generateDocument';
  templateId: string;
  outputFormat?: 'pdf' | 'docx';            // default 'pdf'
  staticPayload?: Record<string, unknown>;  // merged into the built payload (e.g. logoUrl)
}

/** Future variant — open a task to a responsible person. Not dispatched yet. */
export interface CreateTaskAction extends BaseBookingAction {
  type: 'createTask';
  responsibleKey: string;
  taskTitleKey: string;
}

export type BookingAction = GenerateDocumentAction | CreateTaskAction;
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p libs/finance/booking/util/tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add libs/finance/booking/util/src/lib/booking-action.model.ts
git commit -m "feat(booking): add BookingAction descriptor types"
```

---

## Task 3: `matchActions` (pure, TDD)

**Files:**
- Create: `libs/finance/booking/util/src/lib/booking-action.util.ts`
- Create: `libs/finance/booking/util/src/lib/booking-action.util.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
// libs/finance/booking/util/src/lib/booking-action.util.spec.ts
import { describe, expect, it } from 'vitest';
import { matchActions } from './booking-action.util';
import { BookingAction } from './booking-action.model';

const RECEIPT: BookingAction = {
  id: 'gss-spende-receipt',
  type: 'generateDocument',
  trigger: { accountingTenantId: 'gss', accountId: '3407' },
  templateId: 'gss-spendenbestaetigung',
  labelKey: '@finance/booking/feature.action.createReceipt',
  icon: 'document',
};
const ACTIONS = [RECEIPT];

describe('matchActions', () => {
  it('returns the action when tenant and account both match', () => {
    expect(matchActions('gss', ['1020', '3407'], ACTIONS)).toEqual([RECEIPT]);
  });
  it('returns nothing when the account is absent', () => {
    expect(matchActions('gss', ['1020', '3400'], ACTIONS)).toEqual([]);
  });
  it('returns nothing when the tenant differs', () => {
    expect(matchActions('scs', ['3407'], ACTIONS)).toEqual([]);
  });
  it('returns nothing for an empty account list', () => {
    expect(matchActions('gss', [], ACTIONS)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `pnpm nx test finance-booking-util --testFile=booking-action.util.spec.ts`
Expected: FAIL — `matchActions` is not defined.

- [ ] **Step 3: Implement `matchActions`**

```ts
// libs/finance/booking/util/src/lib/booking-action.util.ts
import { BookingAction } from './booking-action.model';

/**
 * Returns every action whose trigger matches the given accounting tenant and
 * whose trigger account number appears among the booking's line account ids.
 */
export function matchActions(
  accountingTenantId: string,
  accountIds: string[],
  actions: BookingAction[],
): BookingAction[] {
  return actions.filter(
    (a) =>
      a.trigger.accountingTenantId === accountingTenantId &&
      accountIds.includes(a.trigger.accountId),
  );
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `pnpm nx test finance-booking-util --testFile=booking-action.util.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add libs/finance/booking/util/src/lib/booking-action.util.ts libs/finance/booking/util/src/lib/booking-action.util.spec.ts
git commit -m "feat(booking): add matchActions with tests"
```

---

## Task 4: `buildReceiptPayload` (pure, TDD)

**Files:**
- Modify: `libs/finance/booking/util/src/lib/booking-action.util.ts`
- Modify: `libs/finance/booking/util/src/lib/booking-action.util.spec.ts`

This function is pure: callers resolve the counterparty into a `PersonModel | OrgModel` plus an
`AddressModel` and pass them in, along with the booked amount (Rappen) and the booking date.

- [ ] **Step 1: Add failing tests**

Append to `booking-action.util.spec.ts`:

```ts
import { buildReceiptPayload } from './booking-action.util';
import { AddressModel, OrgModel, PersonModel } from '@bk2/shared-models';

function addr(): AddressModel {
  const a = new AddressModel();
  a.streetName = 'Seestrasse';
  a.streetNumber = '12';
  a.zipCode = '8712';
  a.city = 'Stäfa';
  return a;
}

describe('buildReceiptPayload', () => {
  it('builds a female person payload with "Liebe" greeting and formatted amount', () => {
    const p = new PersonModel('gss');
    p.firstName = 'Anna'; p.lastName = 'Muster'; p.gender = 'female';
    const payload = buildReceiptPayload(
      { kind: 'person', person: p }, addr(), 100000, '20260507',
    );
    expect(payload).toMatchObject({
      greeting: 'Liebe Anna',
      firstName: 'Anna', lastName: 'Muster',
      streetName: 'Seestrasse', streetNumber: '12', zipCode: '8712', city: 'Stäfa',
      date: '07.05.2026',
      amount: "1’000.00",
    });
  });

  it('uses "Lieber" for a male person', () => {
    const p = new PersonModel('gss');
    p.firstName = 'Hans'; p.lastName = 'Muster'; p.gender = 'male';
    const payload = buildReceiptPayload({ kind: 'person', person: p }, addr(), 5000, '20260101');
    expect(payload.greeting).toBe('Lieber Hans');
    expect(payload.amount).toBe('50.00');
  });

  it('builds an org payload with a neutral greeting and org name as lastName', () => {
    const o = new OrgModel('gss');
    o.name = 'Stiftung Test';
    const payload = buildReceiptPayload({ kind: 'org', org: o }, addr(), 250000, '20260507');
    expect(payload).toMatchObject({
      greeting: 'Sehr geehrte Damen und Herren',
      firstName: '', lastName: 'Stiftung Test',
      amount: "2’500.00",
    });
  });
});
```

> Before writing the implementation, confirm the constructors: `PersonModel('gss')`, `OrgModel('gss')`, `new AddressModel()`, the org name field (`OrgModel.name`), and that `PersonModel.gender` accepts `'female'`/`'male'`. If a constructor signature differs, adjust the test setup (not the assertions).

- [ ] **Step 2: Run the tests, verify they fail**

Run: `pnpm nx test finance-booking-util --testFile=booking-action.util.spec.ts`
Expected: FAIL — `buildReceiptPayload` is not defined.

- [ ] **Step 3: Implement `buildReceiptPayload`**

Add to `booking-action.util.ts`:

```ts
import { AddressModel, OrgModel, PersonModel } from '@bk2/shared-models';
import { convertDateFormatToString, DateFormat } from '@bk2/shared-util-core';

export type ReceiptParty =
  | { kind: 'person'; person: PersonModel }
  | { kind: 'org'; org: OrgModel };

/** Swiss-grouped amount string, e.g. 100000 Rappen → "1’000.00". */
function formatChf(rappen: number): string {
  return new Intl.NumberFormat('de-CH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(rappen / 100);
}

/** Dynamic fields for the donation-receipt template. The caller merges any staticPayload (e.g. logoUrl). */
export function buildReceiptPayload(
  party: ReceiptParty,
  address: AddressModel,
  amountRappen: number,
  bookingDate: string,   // StoreDate, yyyymmdd
): Record<string, string> {
  const isPerson = party.kind === 'person';
  const firstName = isPerson ? party.person.firstName : '';
  const lastName = isPerson ? party.person.lastName : party.org.name;
  const greeting = isPerson
    ? (party.person.gender === 'female' ? 'Liebe ' : 'Lieber ') + party.person.firstName
    : 'Sehr geehrte Damen und Herren';

  return {
    greeting,
    firstName,
    lastName,
    streetName: address.streetName,
    streetNumber: address.streetNumber,
    zipCode: address.zipCode,
    city: address.city,
    date: convertDateFormatToString(bookingDate, DateFormat.StoreDate, DateFormat.ViewDate, false),
    amount: formatChf(amountRappen),
  };
}
```

> `DateFormat.ViewDate` must render `DD.MM.YYYY`. If the test shows a different separator/order, fix the call (e.g. the boolean "keep separators" flag) — do not change the expected `'07.05.2026'`.

- [ ] **Step 4: Run the tests, verify they pass**

Run: `pnpm nx test finance-booking-util --testFile=booking-action.util.spec.ts`
Expected: PASS (all `matchActions` + `buildReceiptPayload` tests).

- [ ] **Step 5: Commit**

```bash
git add libs/finance/booking/util/src/lib/booking-action.util.ts libs/finance/booking/util/src/lib/booking-action.util.spec.ts
git commit -m "feat(booking): add buildReceiptPayload for person and org"
```

---

## Task 5: The action registry + util exports

**Files:**
- Create: `libs/finance/booking/util/src/lib/booking-actions.ts`
- Modify: `libs/finance/booking/util/src/index.ts`

- [ ] **Step 1: Create the registry**

```ts
// libs/finance/booking/util/src/lib/booking-actions.ts
import { BookingAction } from './booking-action.model';

/**
 * Config-driven booking actions, matched by (accountingTenantId, accountId).
 * Code registry for now; shaped so it can move to a Firestore collection later
 * without changing matchActions / runAction.
 */
export const BOOKING_ACTIONS: BookingAction[] = [
  {
    id: 'gss-spende-receipt',
    type: 'generateDocument',
    trigger: { accountingTenantId: 'gss', accountId: '3407' },
    templateId: 'gss-spendenbestaetigung',
    outputFormat: 'pdf',
    staticPayload: { logoUrl: 'https://bkaiser.imgix.net/tenant/scs/logo/gss.png' },
    labelKey: '@finance/booking/feature.action.createReceipt',
    icon: 'document',
  },
];
```

- [ ] **Step 2: Export the new symbols**

Add to `libs/finance/booking/util/src/index.ts` (keep existing exports):

```ts
export * from './lib/booking-action.model';
export * from './lib/booking-action.util';
export * from './lib/booking-actions';
```

- [ ] **Step 3: Type-check the util lib**

Run: `npx tsc --noEmit -p libs/finance/booking/util/tsconfig.json`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add libs/finance/booking/util/src/lib/booking-actions.ts libs/finance/booking/util/src/index.ts
git commit -m "feat(booking): add BOOKING_ACTIONS registry and util exports"
```

---

## Task 6: i18n keys for the action

**Files:**
- Modify: `libs/finance/booking/util/src/lib/booking-i18n.ts`
- Modify: `libs/finance/booking/feature/src/i18n/de.json`

> Follow the `i18n` skill. Keys are added to the util `*-i18n.ts` map and the German strings to the feature `de.json`. The action label key used here is `@finance/booking/feature.action.createReceipt`; the hint is `action.counterpartyRequired`.

- [ ] **Step 1: Add keys to the i18n map**

In `libs/finance/booking/util/src/lib/booking-i18n.ts`, add to `BOOKING_I18N_KEYS`:

```ts
  action_createReceipt:        PFX + 'action.createReceipt',
  action_counterpartyRequired: PFX + 'action.counterpartyRequired',
  action_noAddress:            PFX + 'action.noAddress',
  action_failed:               PFX + 'action.failed',
```

- [ ] **Step 2: Add the German strings**

In `libs/finance/booking/feature/src/i18n/de.json`, add under the existing `action` object (create the path if absent). The file is nested JSON; the keys above map to `action.createReceipt` etc. within scope `@finance/booking/feature`:

```json
{
  "action": {
    "createReceipt": "Gönnerbestätigung erstellen",
    "counterpartyRequired": "Bitte zuerst den Absender (Gegenpartei) erfassen.",
    "noAddress": "Für die Gegenpartei ist keine Adresse hinterlegt.",
    "failed": "Das Dokument konnte nicht erstellt werden."
  }
}
```

> If `de.json` does not yet exist for this lib, create it following a sibling lib's `de.json` shape (see the `i18n` skill for the new-lib file structure), with the scope root and the `action` object above.

- [ ] **Step 3: Type-check the util lib**

Run: `npx tsc --noEmit -p libs/finance/booking/util/tsconfig.json`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add libs/finance/booking/util/src/lib/booking-i18n.ts libs/finance/booking/feature/src/i18n/de.json
git commit -m "feat(booking): add i18n keys for booking receipt action"
```

---

## Task 7: `getFavoritePostalAddress` on AddressService

**Files:**
- Modify: `libs/subject/address/data-access/src/lib/address.service.ts`

The receipt needs the counterparty's favourite postal address. `AddressService` already queries by
`parentKey` (see `listBankAccounts`). Add a focused method returning the single favourite postal
address for a subject.

- [ ] **Step 1: Add the method**

Add to `AddressService` (mirror the existing `listBankAccounts` query shape; confirm the postal
channel constant name in `@bk2/shared-categories`/`shared-models` — it is the `AddressChannel`
value for a postal address, e.g. `AddressChannel.Postal`):

```ts
import { map } from 'rxjs/operators';
import { AddressChannel } from '@bk2/shared-models';

/**
 * Returns the favourite postal address for a subject (person or org), or undefined.
 * @param parentKey the subject's bkey (AddressModel.parentKey)
 */
public getFavoritePostalAddress(parentKey: string): Observable<AddressModel | undefined> {
  const query = getSystemQuery(this.tenantId);
  query.push({ key: 'parentKey', operator: '==', value: parentKey });
  query.push({ key: 'addressChannel', operator: '==', value: AddressChannel.Postal });
  return this.firestoreService
    .searchData<AddressModel>(AddressCollection, query, 'isFavorite', 'desc')
    .pipe(map((addresses) => addresses[0]));
}
```

> Check the existing imports in `address.service.ts` for `getSystemQuery`, `this.tenantId`, `AddressCollection`, and `map` before adding duplicates. Use the actual postal `AddressChannel` enum member; if the codebase stores channel as a plain string, match the value used elsewhere for postal addresses.

- [ ] **Step 2: Type-check the address data-access lib**

Run: `npx tsc --noEmit -p libs/subject/address/data-access/tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add libs/subject/address/data-access/src/lib/address.service.ts
git commit -m "feat(address): add getFavoritePostalAddress(parentKey)"
```

---

## Task 8: BookingStore — lines per booking, available actions, dispatch

**Files:**
- Modify: `libs/finance/booking/feature/src/lib/booking.store.ts`

`availableActions` needs (a) each booking's line account *numbers* and (b) whether a counterparty is
set. `runAction` resolves the counterparty and calls the doc generator.

- [ ] **Step 1: Add service injections and a key→id account map**

Extend the `withProps` injections (keep existing ones):

```ts
import { AccountService } from '@bk2/finance-account-data-access';
import { PersonService } from '@bk2/subject-person-data-access';
import { OrgService } from '@bk2/subject-org-data-access';
import { AddressService } from '@bk2/subject-address-data-access';
import { DocGenerationService } from '@bk2/pdf-template-data-access';
import { ModelSelectService } from '@bk2/shared-feature';
```

Add to the first `withProps(() => ({ ... }))` block:

```ts
    accountService: inject(AccountService),
    personService: inject(PersonService),
    orgService: inject(OrgService),
    addressService: inject(AddressService),
    docGenerationService: inject(DocGenerationService),
    modelSelectService: inject(ModelSelectService),
    toastController: inject(ToastController),
```

Add `ToastController` to the existing `@ionic/angular/standalone` import.

- [ ] **Step 2: Load all booking lines and accounts as resources**

Add to the second `withProps(store => ({ ... }))` block (next to `bookingsResource`):

```ts
    linesResource: rxResource({
      stream: () => store.bookingLineService.list(store.accountingStore.accountingTenantId()),
    }),
    accountsResource: rxResource({
      stream: () => store.accountService.list('id', 'asc'),
    }),
```

> Confirm `BookingLineService.list(accountingTenantId)` exists and returns all lines for the tenant. If its signature differs, use the actual method that lists booking lines for an accounting tenant.

- [ ] **Step 3: Add computed maps**

Add to `withComputed`:

```ts
    accountIdByKey: computed(() => {
      const map = new Map<string, string>();
      for (const a of store.accountsResource.value() ?? []) map.set(a.bkey, a.id);
      return map;
    }),
    linesByBooking: computed(() => {
      const map = new Map<string, BookingLineModel[]>();
      for (const line of store.linesResource.value() ?? []) {
        const arr = map.get(line.bookingKey) ?? [];
        arr.push(line);
        map.set(line.bookingKey, arr);
      }
      return map;
    }),
```

- [ ] **Step 4: Add `availableActions` and `runAction` methods**

Add to `withMethods` (alongside `openEdit`):

```ts
    availableActions(booking: BookingModel): BookingAction[] {
      const lines = store.linesByBooking().get(booking.bkey) ?? [];
      const accountIds = lines
        .map((l) => store.accountIdByKey().get(l.accountKey))
        .filter((id): id is string => !!id);
      return matchActions(booking.accountingTenantId, accountIds, BOOKING_ACTIONS);
    },

    async selectCounterparty(): Promise<AvatarInfo | undefined> {
      // choose person or org, then pick; returns an AvatarInfo or undefined
      const person = await store.modelSelectService.selectPersonAvatar();
      return person;
    },

    async runAction(action: BookingAction, booking: BookingModel): Promise<void> {
      if (action.type !== 'generateDocument') return;  // other variants not dispatched yet
      if (!booking.counterparty) {
        await this.toast(store.i18n.action_counterpartyRequired());
        return;
      }
      // find the amount booked to the trigger account (credit side of the donation account)
      const lines = store.linesByBooking().get(booking.bkey) ?? [];
      const line = lines.find(
        (l) => store.accountIdByKey().get(l.accountKey) === action.trigger.accountId,
      );
      const amountRappen = line?.creditAmount?.amount ?? line?.debitAmount?.amount ?? 0;

      // resolve the counterparty (person or org) + favourite postal address
      const cp = booking.counterparty;
      const address = await firstValueFrom(store.addressService.getFavoritePostalAddress(cp.key));
      if (!address) {
        await this.toast(store.i18n.action_noAddress());
        return;
      }
      let party: ReceiptParty;
      if (cp.modelType === 'org') {
        const org = await firstValueFrom(store.orgService.read(cp.key));
        if (!org) { await this.toast(store.i18n.action_failed()); return; }
        party = { kind: 'org', org };
      } else {
        const person = await firstValueFrom(store.personService.read(cp.key));
        if (!person) { await this.toast(store.i18n.action_failed()); return; }
        party = { kind: 'person', person };
      }

      const payload = {
        ...(action.staticPayload ?? {}),
        ...buildReceiptPayload(party, address, amountRappen, booking.date),
      };

      try {
        const res = await store.docGenerationService.generate({
          templateId: action.templateId,
          payload,
          options: {
            outputFormat: action.outputFormat ?? 'pdf',
            storageMode: 'persist',
            margin: { top: '0', right: '0', bottom: '0', left: '0' },
            metadata: { entityType: 'booking', entityId: booking.bkey },
          },
        });
        window.open(res.url, '_blank');
      } catch {
        await this.toast(store.i18n.action_failed());
      }
    },

    async toast(message: string): Promise<void> {
      const t = await store.toastController.create({ message, duration: 2500 });
      await t.present();
    },
```

Add the imports at the top of the file:

```ts
import { firstValueFrom } from 'rxjs';
import { ToastController } from '@ionic/angular/standalone';
import { AvatarInfo } from '@bk2/shared-models';
import {
  BOOKING_ACTIONS, BookingAction, ReceiptParty,
  matchActions, buildReceiptPayload,
} from '@bk2/finance-booking-util';
```

> `store.personService.read(...)` already does `take(1)`; `firstValueFrom` is safe. Confirm `OrgService.read` and `AddressService.getFavoritePostalAddress` complete (they use `searchData`/`readModel` — wrap with `take(1)` via `firstValueFrom` which takes the first emission). If a stream does not complete, use `firstValueFrom(obs.pipe(take(1)))`.

- [ ] **Step 5: Update booking-feature tsconfig references**

Ensure `libs/finance/booking/feature/tsconfig.json` lists references for the newly used libs:
`@bk2/finance-account-data-access`, `@bk2/subject-person-data-access`, `@bk2/subject-org-data-access`,
`@bk2/subject-address-data-access`, `@bk2/pdf-template-data-access`. Add any missing ones (follow the
existing reference entries as templates). Confirm each is also declared in the lib's `package.json`
dependencies per the repo's hard rule.

- [ ] **Step 6: Type-check the feature lib**

Run: `npx tsc --noEmit -p libs/finance/booking/feature/tsconfig.json`
Expected: no errors. Fix any missing reference/`package.json` entries surfaced as `TS6059`.

- [ ] **Step 7: Commit**

```bash
git add libs/finance/booking/feature/src/lib/booking.store.ts libs/finance/booking/feature/tsconfig.json
git commit -m "feat(booking): availableActions + runAction in BookingStore"
```

---

## Task 9: Counterparty picker in booking-edit modal

**Files:**
- Modify: `libs/finance/booking/feature/src/lib/booking-edit.modal.ts`

Let the user set `editBooking.counterparty` via the shared `bk-avatar-select`, choosing a person or
an org (mirrors `task-edit.modal.ts`).

- [ ] **Step 1: Import the avatar-select and model-select service**

```ts
import { AvatarSelect } from '@bk2/avatar-ui';
import { ModelSelectService } from '@bk2/shared-feature';
import { ActionSheetController } from '@ionic/angular/standalone';
```

Add `AvatarSelect` to the component `imports` array.

- [ ] **Step 2: Add the picker UI**

In the template, after the Description item, add:

```html
      <bk-avatar-select
        name="counterparty"
        title="Gegenpartei"
        selectLabel="auswählen"
        [avatar]="editBooking.counterparty"
        [clearable]="true"
        [readOnly]="readOnly()"
        (selectClicked)="selectCounterparty()"
        (clearClicked)="editBooking.counterparty = undefined" />
```

- [ ] **Step 3: Add the handler**

In the class body:

```ts
  private readonly modelSelectService = inject(ModelSelectService);
  private readonly actionSheetCtrl = inject(ActionSheetController);

  protected async selectCounterparty(): Promise<void> {
    const sheet = await this.actionSheetCtrl.create({
      header: 'Gegenpartei',
      buttons: [
        { text: 'Person', role: 'person' },
        { text: 'Organisation', role: 'org' },
        { text: 'Abbrechen', role: 'cancel' },
      ],
    });
    await sheet.present();
    const { role } = await sheet.onDidDismiss();
    let avatar;
    if (role === 'person') avatar = await this.modelSelectService.selectPersonAvatar();
    else if (role === 'org') avatar = await this.modelSelectService.selectOrgAvatar();
    if (avatar) this.editBooking.counterparty = avatar;
  }
```

> `editBooking` is the modal's working copy (the file uses `editBooking`/`editLines` with `ngModel`). If the modal clones its input, assign to the clone, not the `input()`. Confirm the property name used by the existing template (`editBooking`).

- [ ] **Step 4: Ensure counterparty is returned on save**

Confirm the modal's `save()`/`dismiss('confirm', ...)` passes the whole `editBooking` (it does — it
returns `{ booking, lines }`). No change needed if `editBooking` already carries `counterparty`.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit -p libs/finance/booking/feature/tsconfig.json`
Expected: no errors. Ensure `@bk2/avatar-ui` is in the feature lib's tsconfig references + package.json.

- [ ] **Step 6: Commit**

```bash
git add libs/finance/booking/feature/src/lib/booking-edit.modal.ts libs/finance/booking/feature/tsconfig.json
git commit -m "feat(booking): pick counterparty (person/org) in edit modal"
```

---

## Task 10: Per-item ActionSheet on the booking list

**Files:**
- Modify: `libs/finance/booking/feature/src/lib/booking-list.ts`

Add an actions trigger per booking that opens an ActionSheet of `availableActions`. Actions are
disabled (shown with a hint) when the booking has no counterparty.

- [ ] **Step 1: Import ActionSheetController and an actions button**

```ts
import { ActionSheetController, IonButton } from '@ionic/angular/standalone';
import { BookingModel } from '@bk2/shared-models';
```

Add `IonButton` to `imports`.

- [ ] **Step 2: Add a per-item actions button**

In the `@for` item, add inside the `ion-item` (only when actions exist):

```html
              @if (store.availableActions(booking).length > 0) {
                <ion-button slot="end" fill="clear" (click)="openActions($event, booking)">
                  <ion-icon src="{{ 'ellipsis-vertical' | svgIcon }}" />
                </ion-button>
              }
```

> Use a real icon name from the `icons` skill set (`ellipsis-vertical` is illustrative — verify it resolves; otherwise pick a valid menu/overflow icon). The button is inside the clickable `ion-item`, so call `event.stopPropagation()` in the handler to avoid also opening the edit modal.

- [ ] **Step 3: Add the handler**

```ts
  private readonly actionSheetCtrl = inject(ActionSheetController);

  protected async openActions(event: Event, booking: BookingModel): Promise<void> {
    event.stopPropagation();
    const actions = this.store.availableActions(booking);
    const hasCounterparty = !!booking.counterparty;
    const sheet = await this.actionSheetCtrl.create({
      header: booking.title,
      buttons: [
        ...actions.map((a) => ({
          text: this.store.i18n[this.labelKey(a.id)](),
          handler: hasCounterparty ? () => { this.store.runAction(a, booking); } : undefined,
        })),
        ...(hasCounterparty ? [] : [{ text: this.store.i18n.action_counterpartyRequired(), role: 'destructive' as const }]),
        { text: 'Abbrechen', role: 'cancel' as const },
      ],
    });
    await sheet.present();
  }
```

> Simpler than mapping `labelKey` dynamically: since there is one action today, label it directly
> with `this.store.i18n.action_createReceipt()`. Replace the `actions.map(...)` text with
> `this.store.i18n.action_createReceipt()` and drop the `labelKey` helper. Keep the structure ready
> for more actions, but do not add an unused dynamic-key indirection (YAGNI).

Concretely, the buttons array for today's single action:

```ts
      buttons: [
        ...actions.map((a) => ({
          text: this.store.i18n.action_createReceipt(),
          handler: hasCounterparty ? () => { this.store.runAction(a, booking); } : undefined,
        })),
        ...(hasCounterparty ? [] : [{ text: this.store.i18n.action_counterpartyRequired(), role: 'destructive' as const }]),
        { text: 'Abbrechen', role: 'cancel' as const },
      ],
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit -p libs/finance/booking/feature/tsconfig.json`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add libs/finance/booking/feature/src/lib/booking-list.ts
git commit -m "feat(booking): per-item ActionSheet for booking actions"
```

---

## Task 11: Seed the template into Firestore

**Files:**
- Create: `scripts/templates/gss-spendenbestaetigung.hbs`
- Create: `scripts/seed-gss-spendenbestaetigung.mjs`

- [ ] **Step 1: Add the template source under version control**

Copy the finalized template into the repo:

```bash
cp ~/Downloads/gss-spendenbestaetigung.hbs scripts/templates/gss-spendenbestaetigung.hbs
```

Open it and confirm it contains **no** custom Handlebars helpers (only `{{firstName}}`,
`{{lastName}}`, `{{greeting}}`, `{{streetName}}`, `{{streetNumber}}`, `{{zipCode}}`, `{{city}}`,
`{{date}}`, `CHF {{amount}}`, `{{logoUrl}}`).

- [ ] **Step 2: Write the seed script**

```js
// scripts/seed-gss-spendenbestaetigung.mjs
/**
 * One-time seed: publishes the gss Spendenbestätigung template (+ version 1) to Firestore.
 *
 * Run with:  node scripts/seed-gss-spendenbestaetigung.mjs
 * Requires:  gcloud auth application-default login  (or GOOGLE_APPLICATION_CREDENTIALS)
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (!getApps().length) initializeApp({ projectId: 'bkaiser-org' });
const db = getFirestore();

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(__dirname, 'templates', 'gss-spendenbestaetigung.hbs'), 'utf8');

const TENANT = 'gss';
const TEMPLATE_ID = 'gss-spendenbestaetigung';
const now = new Date().toISOString().slice(0, 10).replace(/-/g, ''); // yyyymmdd

const sampleData = {
  logoUrl: 'https://bkaiser.imgix.net/tenant/scs/logo/gss.png',
  greeting: 'Liebe Anna',
  firstName: 'Anna', lastName: 'Muster',
  streetName: 'Seestrasse', streetNumber: '12',
  zipCode: '8712', city: 'Stäfa',
  date: '07.05.2026',
  amount: '1’000.00',
};

await db.collection('templates').doc(TEMPLATE_ID).set({
  tenants: [TENANT],
  isArchived: false,
  index: TEMPLATE_ID,
  name: 'Gönnerbestätigung GSS',
  description: 'Spendenbestätigung Gönnerverein Seeclub Stäfa',
  category: 'other',
  language: 'de',
  currentVersion: 1,
  draftVersion: null,
  status: 'published',
  defaultOutputFormat: 'pdf',
  defaultFormat: 'A4',
  defaultOrientation: 'portrait',
  sampleData: JSON.stringify(sampleData),
  payloadSchema: '',
  createdAt: now,
  createdBy: 'seed',
  updatedAt: now,
  updatedBy: 'seed',
});

await db.collection('templates').doc(TEMPLATE_ID)
  .collection('versions').doc('1').set({
    version: 1,
    html,
    css: '',
    partials: {},
    assets: [],
    status: 'published',
    changelog: 'Initial seed',
    publishedAt: now,
    publishedBy: 'seed',
    createdAt: now,
    createdBy: 'seed',
  });

console.log(`Seeded template ${TEMPLATE_ID} (version 1) for tenant ${TENANT}.`);
process.exit(0);
```

> Confirm the Firebase `projectId` (`bkaiser-org`) matches `scripts/seed-website-content.mjs`. The
> field set mirrors `TemplateModel` / `TemplateVersionModel` in `pdf-template.model.ts`; keep them in
> sync if the model changed.

- [ ] **Step 3: Run the seed script**

Run: `node scripts/seed-gss-spendenbestaetigung.mjs`
Expected: `Seeded template gss-spendenbestaetigung (version 1) for tenant gss.`
Verify in the Firebase console that `templates/gss-spendenbestaetigung` and its `versions/1` exist
with `status: 'published'` and `currentVersion: 1`.

- [ ] **Step 4: Commit**

```bash
git add scripts/templates/gss-spendenbestaetigung.hbs scripts/seed-gss-spendenbestaetigung.mjs
git commit -m "chore(scripts): seed gss Spendenbestätigung template"
```

---

## Task 12: Full type-check, unit tests, and manual verification

**Files:** none (verification only)

- [ ] **Step 1: Run the util unit tests**

Run: `pnpm run test finance-booking-util`
Expected: PASS (matchActions + buildReceiptPayload).

- [ ] **Step 2: Type-check every touched lib**

Run each and expect no errors:

```bash
npx tsc --noEmit -p libs/shared/models/tsconfig.json
npx tsc --noEmit -p libs/finance/booking/util/tsconfig.json
npx tsc --noEmit -p libs/finance/booking/feature/tsconfig.json
npx tsc --noEmit -p libs/subject/address/data-access/tsconfig.json
```

- [ ] **Step 3: Manual end-to-end check (emulator or dev)**

1. Open a gss accounting tenant; open a booking that has a line on account `3407`.
2. Without a counterparty: the booking-list overflow action shows the action **disabled** with the
   "Bitte zuerst den Absender erfassen" hint.
3. Edit the booking, pick a **person** counterparty, save.
4. Trigger *Gönnerbestätigung erstellen*: a PDF opens, margin 0, correct greeting/address/amount.
5. Repeat with an **org** counterparty: neutral greeting, org name shown.

- [ ] **Step 4: Final commit (if any verification fixups were needed)**

```bash
git add -A
git commit -m "chore(booking): verification fixups for counterparty actions"
```

---

## Self-review notes

- **Spec coverage:** counterparty field (T1), action union + registry (T2, T5), matchActions (T3),
  person/org payload (T4), favourite address (T7), store dispatch with persist + disabled-hint (T8,
  T10), counterparty picker (T9), seed script (T11), tests + manual (T12). `createTask` and
  Firestore-backed registry are intentionally not implemented (design "designed-for, not built").
- **Type consistency:** `matchActions(accountingTenantId, accountIds, actions)`, `buildReceiptPayload(party, address, amountRappen, bookingDate)` and `ReceiptParty` are used identically in tests (T3/T4), the registry (T5), and the store (T8). `GenerateDocumentAction.staticPayload` is set in T5 and merged in T8. `DocGenerationService.generate` options match the callable's `GenerateDocumentRequest` (T8).
- **Assumptions to confirm during execution (flagged inline):** `BookingLineService.list(accountingTenantId)` signature, postal `AddressChannel` enum member, `DateFormat.ViewDate` output, the booking-edit working-copy property name (`editBooking`), and a valid overflow icon name.

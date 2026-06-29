# Person Duplicate Detection & Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a `memberAdmin` adds a person, detect potential duplicates across ALL tenants, show them in a modal, and let the admin reuse an existing person (with per-field reconciliation) or create a new one.

**Architecture:** Two callable Cloud Functions (admin SDK, cross-tenant) — `findPersonDuplicates` (search) and `mergePersonIntoTenant` (share + apply resolved fields). The client gets two `PersonService` methods, two feature modals (`PersonDuplicateModal`, `PersonReconcileModal`), one pure util (`computePersonFieldDiffs`), and a rewritten `PersonStore.add()` flow.

**Tech Stack:** Angular 20 (zoneless, standalone, signals), Ionic 8, NgRx Signal Stores, Firebase Cloud Functions v2 (`onCall`), Vitest.

**Spec:** [`docs/specs/2026-06-29-person-duplicate-detection-design.md`](../specs/2026-06-29-person-duplicate-detection-design.md)

---

## File Structure

**New files**
- `libs/subject/person/util/src/lib/person-duplicate.model.ts` — shared types (candidate, requests, responses, `ReconcilableField`, `PersonFieldDiff`).
- `libs/subject/person/util/src/lib/person-field-diff.util.ts` — `computePersonFieldDiffs()` pure function.
- `libs/subject/person/util/src/lib/person-field-diff.util.spec.ts` — Vitest unit test.
- `apps/functions/src/person/index.ts` — `findPersonDuplicates`, `mergePersonIntoTenant`.
- `libs/subject/person/feature/src/lib/person-duplicate.modal.ts` — candidate-list modal.
- `libs/subject/person/feature/src/lib/person-reconcile.modal.ts` — per-field diff modal.

**Modified files**
- `libs/subject/person/util/src/index.ts` — export new util symbols.
- `libs/subject/person/feature/src/index.ts` — export new modals.
- `apps/functions/src/main.ts` — register the two callables.
- `libs/subject/person/data-access/src/lib/person.service.ts` — remove `checkIfExists`, add `findDuplicates`/`mergeIntoTenant`.
- `libs/subject/person/feature/src/lib/person.store.ts` — new `add()` flow.
- `libs/subject/person/util/src/lib/person-i18n.ts` — new i18n keys.
- `libs/subject/person/feature/src/i18n/de.json` — German strings.

---

## Task 1: Shared types in `subject-person-util`

**Files:**
- Create: `libs/subject/person/util/src/lib/person-duplicate.model.ts`
- Modify: `libs/subject/person/util/src/index.ts`

- [ ] **Step 1: Create the types file**

```typescript
// libs/subject/person/util/src/lib/person-duplicate.model.ts

/** Scalar person fields that can be reconciled between the new-person form and an existing person. */
export type ReconcilableField =
  | 'firstName'
  | 'lastName'
  | 'gender'
  | 'dateOfBirth'
  | 'dateOfDeath'
  | 'ssnId'
  | 'favEmail'
  | 'favPhone'
  | 'favZipCode';

/** A single field whose form value differs from the existing person's value. */
export interface PersonFieldDiff {
  field: ReconcilableField;
  existingValue: string;
  newValue: string;
}

/** Input to the findPersonDuplicates callable (only the candidate-matching fields). */
export interface FindPersonDuplicatesRequest {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  favEmail: string;
  ssnId: string;
}

/** A matching person returned by findPersonDuplicates. No attribute is stripped (memberAdmin-gated). */
export interface PersonDuplicateCandidate {
  bkey: string;
  firstName: string;
  lastName: string;
  gender: string;
  dateOfBirth: string;
  dateOfDeath: string;
  ssnId: string;
  favEmail: string;
  favPhone: string;
  favZipCode: string;
  bexioId: string;
  tenants: string[];
}

export interface FindPersonDuplicatesResponse {
  candidates: PersonDuplicateCandidate[];
}

/** Input to the mergePersonIntoTenant callable. */
export interface MergePersonIntoTenantRequest {
  personKey: string;
  tenantId: string;
  resolvedFields: Partial<Record<ReconcilableField, string>>;
}

export interface MergePersonIntoTenantResponse {
  bkey: string;
}
```

- [ ] **Step 2: Export from the util barrel**

Add this line to `libs/subject/person/util/src/index.ts` (after the existing exports):

```typescript
export * from './lib/person-duplicate.model';
```

- [ ] **Step 3: Type-check the util lib**

Run: `npx tsc --noEmit -p libs/subject/person/util/tsconfig.json`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add libs/subject/person/util/src/lib/person-duplicate.model.ts libs/subject/person/util/src/index.ts
git commit -m "feat(person): duplicate-detection shared types"
```

---

## Task 2: `computePersonFieldDiffs` pure util (TDD)

**Files:**
- Create: `libs/subject/person/util/src/lib/person-field-diff.util.ts`
- Test: `libs/subject/person/util/src/lib/person-field-diff.util.spec.ts`
- Modify: `libs/subject/person/util/src/index.ts`

A diff is included only when the form value is **non-empty** and **differs** (trimmed) from the existing value — so empty form fields never overwrite existing data, and the reconcile modal shows only real conflicts.

- [ ] **Step 1: Write the failing test**

```typescript
// libs/subject/person/util/src/lib/person-field-diff.util.spec.ts
import { describe, expect, it } from 'vitest';
import { PERSON_NEW_FORM_SHAPE, PersonNewFormModel } from './person-new-form.model';
import { PersonDuplicateCandidate } from './person-duplicate.model';
import { computePersonFieldDiffs } from './person-field-diff.util';

function candidate(overrides: Partial<PersonDuplicateCandidate> = {}): PersonDuplicateCandidate {
  return {
    bkey: 'p1', firstName: 'Anna', lastName: 'Muster', gender: 'female',
    dateOfBirth: '', dateOfDeath: '', ssnId: '', favEmail: '', favPhone: '',
    favZipCode: '', bexioId: '', tenants: ['t1'], ...overrides,
  };
}
function form(overrides: Partial<PersonNewFormModel> = {}): PersonNewFormModel {
  return { ...PERSON_NEW_FORM_SHAPE, firstName: 'Anna', lastName: 'Muster', gender: 'female', ...overrides };
}

describe('computePersonFieldDiffs', () => {
  it('returns no diffs when form matches the existing person', () => {
    expect(computePersonFieldDiffs(candidate(), form())).toEqual([]);
  });

  it('reports a diff when the form adds a value the existing person lacks', () => {
    const diffs = computePersonFieldDiffs(candidate({ dateOfBirth: '' }), form({ dateOfBirth: '1990-04-02' }));
    expect(diffs).toEqual([{ field: 'dateOfBirth', existingValue: '', newValue: '1990-04-02' }]);
  });

  it('reports a diff when values differ, mapping email/phone/zip to fav fields', () => {
    const diffs = computePersonFieldDiffs(
      candidate({ favEmail: 'a@x.ch', favPhone: '111', favZipCode: '8000' }),
      form({ email: 'a@y.ch', phone: '111', zipCode: '8001' }),
    );
    expect(diffs).toEqual([
      { field: 'favEmail', existingValue: 'a@x.ch', newValue: 'a@y.ch' },
      { field: 'favZipCode', existingValue: '8000', newValue: '8001' },
    ]);
  });

  it('ignores empty form values (never proposes wiping existing data)', () => {
    const diffs = computePersonFieldDiffs(candidate({ ssnId: '756.1234.5678.90' }), form({ ssnId: '' }));
    expect(diffs).toEqual([]);
  });

  it('treats whitespace-only differences as equal', () => {
    const diffs = computePersonFieldDiffs(candidate({ favEmail: 'a@x.ch' }), form({ email: '  a@x.ch  ' }));
    expect(diffs).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm nx test subject-person-util`
Expected: FAIL — `computePersonFieldDiffs` is not exported / module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// libs/subject/person/util/src/lib/person-field-diff.util.ts
import { PersonNewFormModel } from './person-new-form.model';
import { PersonDuplicateCandidate, PersonFieldDiff, ReconcilableField } from './person-duplicate.model';

/** Maps each reconcilable person field to the form field that supplies its new value. */
const FIELD_SOURCE: Record<ReconcilableField, keyof PersonNewFormModel> = {
  firstName: 'firstName',
  lastName: 'lastName',
  gender: 'gender',
  dateOfBirth: 'dateOfBirth',
  dateOfDeath: 'dateOfDeath',
  ssnId: 'ssnId',
  favEmail: 'email',
  favPhone: 'phone',
  favZipCode: 'zipCode',
};

/**
 * Compares an existing person against the new-person form input and returns one entry per field
 * whose form value is non-empty and differs (trimmed) from the existing value. Empty form values
 * are skipped so reconciliation never proposes wiping established data.
 */
export function computePersonFieldDiffs(
  existing: PersonDuplicateCandidate,
  form: PersonNewFormModel,
): PersonFieldDiff[] {
  const diffs: PersonFieldDiff[] = [];
  for (const field of Object.keys(FIELD_SOURCE) as ReconcilableField[]) {
    const newValue = String(form[FIELD_SOURCE[field]] ?? '').trim();
    const existingValue = String(existing[field] ?? '').trim();
    if (newValue.length > 0 && newValue !== existingValue) {
      diffs.push({ field, existingValue, newValue });
    }
  }
  return diffs;
}
```

- [ ] **Step 4: Export from the util barrel**

Add to `libs/subject/person/util/src/index.ts`:

```typescript
export * from './lib/person-field-diff.util';
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm nx test subject-person-util`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add libs/subject/person/util/src/lib/person-field-diff.util.ts libs/subject/person/util/src/lib/person-field-diff.util.spec.ts libs/subject/person/util/src/index.ts
git commit -m "feat(person): computePersonFieldDiffs util"
```

---

## Task 3: Cloud Functions — `findPersonDuplicates` + `mergePersonIntoTenant`

**Files:**
- Create: `apps/functions/src/person/index.ts`
- Modify: `apps/functions/src/main.ts`

Note: the functions bundle must stay Angular-free, so the index string is built inline with
`addIndexElement` (from `@bk2/shared-util-core`) rather than importing the Angular-laden
`@bk2/subject-person-util` barrel. Keep the field order in sync with `getPersonIndex`
(`n, z, fn, bx, dob`) in `libs/subject/person/util/src/lib/person.util.ts`.

- [ ] **Step 1: Write the functions module**

```typescript
// apps/functions/src/person/index.ts
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

import { PersonCollection, UserCollection } from '@bk2/shared-models';
import { addIndexElement } from '@bk2/shared-util-core';
import { checkAppCheckToken, checkAuthentication } from '@bk2/shared-util-functions';
import {
  FindPersonDuplicatesRequest,
  FindPersonDuplicatesResponse,
  MergePersonIntoTenantRequest,
  MergePersonIntoTenantResponse,
  PersonDuplicateCandidate,
} from '@bk2/subject-person-util';

const REGION = 'europe-west6';
const ALLOWED_ROLES = ['admin', 'memberAdmin'];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FsData = Record<string, any>;

/** Throw unless the caller has admin or memberAdmin in their users/{uid}.roles. */
async function requireMemberAdmin(uid: string | undefined, fnName: string): Promise<void> {
  if (!uid) throw new HttpsError('unauthenticated', 'Not authenticated.');
  const snap = await getFirestore().collection(UserCollection).doc(uid).get();
  const roles = (snap.data()?.roles ?? {}) as Record<string, boolean>;
  if (!ALLOWED_ROLES.some((r) => roles[r] === true)) {
    logger.error(`${fnName}: uid ${uid} lacks required role(s): ${ALLOWED_ROLES.join(', ')}`);
    throw new HttpsError('permission-denied', `Requires one of roles: ${ALLOWED_ROLES.join(', ')}.`);
  }
}

/** Mirror of getPersonIndex (subject-person-util) — keep field order in sync. */
function buildPersonIndex(p: FsData): string {
  let index = '';
  index = addIndexElement(index, 'n', p.lastName ?? '');
  index = addIndexElement(index, 'z', p.favZipCode ?? '');
  index = addIndexElement(index, 'fn', p.firstName ?? '');
  index = addIndexElement(index, 'bx', p.bexioId ?? '');
  index = addIndexElement(index, 'dob', p.dateOfBirth ?? '');
  return index;
}

function toCandidate(id: string, d: FsData): PersonDuplicateCandidate {
  return {
    bkey: id,
    firstName: d.firstName ?? '',
    lastName: d.lastName ?? '',
    gender: d.gender ?? '',
    dateOfBirth: d.dateOfBirth ?? '',
    dateOfDeath: d.dateOfDeath ?? '',
    ssnId: d.ssnId ?? '',
    favEmail: d.favEmail ?? '',
    favPhone: d.favPhone ?? '',
    favZipCode: d.favZipCode ?? '',
    bexioId: d.bexioId ?? '',
    tenants: Array.isArray(d.tenants) ? d.tenants : [],
  };
}

/**
 * Cross-tenant duplicate search. A person matches if ANY identifier matches:
 * lastName+firstName (case-insensitive), dateOfBirth, favEmail, or ssnId.
 * Queries are single-field equalities (automatic indexes); isArchived and the firstName
 * case-insensitive comparison are applied in memory (no composite indexes needed).
 */
export const findPersonDuplicates = onCall(
  { region: REGION },
  async (request): Promise<FindPersonDuplicatesResponse> => {
    checkAppCheckToken(request, 'findPersonDuplicates');
    checkAuthentication(request, 'findPersonDuplicates');
    await requireMemberAdmin(request.auth?.uid, 'findPersonDuplicates');

    const { firstName, lastName, dateOfBirth, favEmail, ssnId } =
      (request.data ?? {}) as FindPersonDuplicatesRequest;
    const db = getFirestore();
    const found = new Map<string, FsData>();

    const equalityFields: Array<[string, string | undefined]> = [
      ['ssnId', ssnId],
      ['favEmail', favEmail],
      ['dateOfBirth', dateOfBirth],
    ];
    for (const [field, value] of equalityFields) {
      if (!value) continue;
      const snap = await db.collection(PersonCollection).where(field, '==', value).get();
      snap.forEach((doc) => found.set(doc.id, doc.data()));
    }

    if (lastName) {
      const snap = await db.collection(PersonCollection).where('lastName', '==', lastName).get();
      const wantFirst = (firstName ?? '').trim().toLowerCase();
      snap.forEach((doc) => {
        const data = doc.data();
        if ((data.firstName ?? '').trim().toLowerCase() === wantFirst) found.set(doc.id, data);
      });
    }

    const candidates: PersonDuplicateCandidate[] = [];
    found.forEach((data, id) => {
      if (data.isArchived !== true) candidates.push(toCandidate(id, data));
    });
    return { candidates };
  },
);

/**
 * Shares an existing person into the caller's tenant (arrayUnion, idempotent) and applies the
 * resolved scalar fields chosen during reconciliation, recomputing the search index.
 */
export const mergePersonIntoTenant = onCall(
  { region: REGION },
  async (request): Promise<MergePersonIntoTenantResponse> => {
    checkAppCheckToken(request, 'mergePersonIntoTenant');
    checkAuthentication(request, 'mergePersonIntoTenant');
    await requireMemberAdmin(request.auth?.uid, 'mergePersonIntoTenant');

    const { personKey, tenantId, resolvedFields } =
      (request.data ?? {}) as MergePersonIntoTenantRequest;
    if (!personKey || !tenantId) {
      throw new HttpsError('invalid-argument', 'personKey and tenantId are required.');
    }

    const db = getFirestore();
    const ref = db.collection(PersonCollection).doc(personKey);
    const snap = await ref.get();
    if (!snap.exists) throw new HttpsError('not-found', `Person ${personKey} not found.`);

    const merged: FsData = { ...snap.data(), ...(resolvedFields ?? {}) };
    await ref.update({
      ...(resolvedFields ?? {}),
      tenants: FieldValue.arrayUnion(tenantId),
      index: buildPersonIndex(merged),
    });
    return { bkey: personKey };
  },
);
```

- [ ] **Step 2: Verify `UserCollection` is exported from shared-models**

Run: `grep -rn "export const UserCollection" libs/shared/models/src`
Expected: a match (the users collection name). If it is named differently, use that exact export.

- [ ] **Step 3: Register the functions in main.ts**

Add an import near the other module imports in `apps/functions/src/main.ts`:

```typescript
import * as Person from './person';
```

Add the exports in the exported-functions section (next to the other `export const ...` lines):

```typescript
export const findPersonDuplicates = Person.findPersonDuplicates;
export const mergePersonIntoTenant = Person.mergePersonIntoTenant;
```

- [ ] **Step 4: Build the functions bundle**

Run: `pnpm nx build functions --configuration production`
Expected: build succeeds; output in `dist/`. If it complains about importing `@bk2/subject-person-util`, confirm only the type imports (`FindPersonDuplicatesRequest`, etc.) and no Angular runtime are pulled — types are erased at build time, so this should bundle cleanly.

- [ ] **Step 5: Commit**

```bash
git add apps/functions/src/person/index.ts apps/functions/src/main.ts
git commit -m "feat(functions): findPersonDuplicates + mergePersonIntoTenant callables"
```

---

## Task 4: Client service methods on `PersonService`

**Files:**
- Modify: `libs/subject/person/data-access/src/lib/person.service.ts`

- [ ] **Step 1: Add firebase imports at the top of the file**

Add after the existing imports:

```typescript
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
```

And extend the existing `@bk2/subject-person-util` import to also bring in the new types:

```typescript
import {
  getPersonIndex,
  FindPersonDuplicatesRequest,
  FindPersonDuplicatesResponse,
  MergePersonIntoTenantRequest,
  MergePersonIntoTenantResponse,
  PersonDuplicateCandidate,
  ReconcilableField,
} from '@bk2/subject-person-util';
```

(Adjust the existing `import {getPersonIndex} from '@bk2/subject-person-util';` line — merge it into the block above rather than duplicating.)

- [ ] **Step 2: Add a private functions handle and the two methods; remove `checkIfExists`**

Delete the entire `checkIfExists(...)` method ([person.service.ts:99-117](../../libs/subject/person/data-access/src/lib/person.service.ts#L99-L117)) and add, inside the class:

```typescript
  private readonly functions = getFunctions(getApp(), 'europe-west6');

  /**
   * Cross-tenant duplicate search via the findPersonDuplicates callable.
   * Matches on name / dateOfBirth / favEmail / ssnId. Returns [] on any error.
   */
  public async findDuplicates(req: FindPersonDuplicatesRequest): Promise<PersonDuplicateCandidate[]> {
    try {
      const fn = httpsCallable<FindPersonDuplicatesRequest, FindPersonDuplicatesResponse>(
        this.functions, 'findPersonDuplicates');
      const result = await fn(req);
      return result.data.candidates ?? [];
    } catch (error) {
      console.error('PersonService.findDuplicates failed', error);
      return [];
    }
  }

  /**
   * Shares an existing person into the given tenant and applies the resolved scalar fields,
   * via the mergePersonIntoTenant callable. Returns the merged person key.
   */
  public async mergeIntoTenant(
    personKey: string,
    tenantId: string,
    resolvedFields: Partial<Record<ReconcilableField, string>>,
  ): Promise<string> {
    const fn = httpsCallable<MergePersonIntoTenantRequest, MergePersonIntoTenantResponse>(
      this.functions, 'mergePersonIntoTenant');
    const result = await fn({ personKey, tenantId, resolvedFields });
    return result.data.bkey;
  }
```

- [ ] **Step 3: Type-check the data-access lib**

Run: `npx tsc --noEmit -p libs/subject/person/data-access/tsconfig.json`
Expected: no errors. (The store, which referenced `checkIfExists`, is fixed in Task 8 — if you build the feature lib now it will fail there; that is expected until Task 8.)

- [ ] **Step 4: Commit**

```bash
git add libs/subject/person/data-access/src/lib/person.service.ts
git commit -m "feat(person): findDuplicates + mergeIntoTenant service methods; drop checkIfExists"
```

---

## Task 5: i18n keys

**Files:**
- Modify: `libs/subject/person/util/src/lib/person-i18n.ts`
- Modify: `libs/subject/person/feature/src/i18n/de.json`

- [ ] **Step 1: Add keys to `PERSON_I18N_KEYS`**

In `person-i18n.ts`, add these entries inside the `PERSON_I18N_KEYS` object (e.g. just after the `add_membership_exists` line):

```typescript
    duplicate_title:            PFX + 'duplicate.title',
    duplicate_intro:            PFX + 'duplicate.intro',
    duplicate_create_new:       PFX + 'duplicate.createNew',
    duplicate_tenants:          PFX + 'duplicate.tenants',
    reconcile_title:            PFX + 'reconcile.title',
    reconcile_intro:            PFX + 'reconcile.intro',
    reconcile_keep_existing:    PFX + 'reconcile.keepExisting',
    reconcile_use_new:          PFX + 'reconcile.useNew',
```

- [ ] **Step 2: Add the German strings to de.json**

In `de.json`, add these two top-level objects (e.g. right before the final `"validation": { ... }` block — mind the trailing commas so the JSON stays valid):

```json
  "duplicate": {
    "title": "Mögliche Duplikate gefunden",
    "intro": "Es gibt bereits Personen, die zu den eingegebenen Daten passen. Wähle eine bestehende Person aus oder erstelle trotzdem eine neue.",
    "createNew": "Trotzdem neu erstellen",
    "tenants": "Mandanten"
  },
  "reconcile": {
    "title": "Felder abgleichen",
    "intro": "Die markierten Felder unterscheiden sich. Wähle pro Feld den zu übernehmenden Wert.",
    "keepExisting": "Bestehend",
    "useNew": "Neu"
  },
```

- [ ] **Step 3: Validate JSON + type-check the util lib**

Run: `node -e "require('./libs/subject/person/feature/src/i18n/de.json'); console.log('de.json OK')"`
Expected: `de.json OK`.

Run: `npx tsc --noEmit -p libs/subject/person/util/tsconfig.json`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add libs/subject/person/util/src/lib/person-i18n.ts libs/subject/person/feature/src/i18n/de.json
git commit -m "feat(person): i18n keys for duplicate + reconcile modals"
```

---

## Task 6: `PersonDuplicateModal`

**Files:**
- Create: `libs/subject/person/feature/src/lib/person-duplicate.modal.ts`
- Modify: `libs/subject/person/feature/src/index.ts`

- [ ] **Step 1: Write the modal component**

```typescript
// libs/subject/person/feature/src/lib/person-duplicate.modal.ts
import { Component, inject, input } from '@angular/core';
import { IonButton, IonContent, IonFooter, IonItem, IonLabel, IonList, IonToolbar, ModalController } from '@ionic/angular/standalone';

import { Header } from '@bk2/shared-ui';
import { PersonDuplicateCandidate, PersonI18n } from '@bk2/subject-person-util';

@Component({
  selector: 'bk-person-duplicate-modal',
  standalone: true,
  imports: [Header, IonContent, IonList, IonItem, IonLabel, IonButton, IonFooter, IonToolbar],
  template: `
    <bk-header [i18n]="{ title: i18n().duplicate_title() }" [isModal]="true" />
    <ion-content class="ion-padding">
      <p>{{ i18n().duplicate_intro() }}</p>
      <ion-list>
        @for (c of candidates(); track c.bkey) {
          <ion-item button (click)="select(c)">
            <ion-label>
              <h2>{{ c.firstName }} {{ c.lastName }}</h2>
              <p>
                {{ c.gender }}
                @if (c.dateOfBirth) { · {{ c.dateOfBirth }} }
                @if (c.ssnId) { · {{ c.ssnId }} }
              </p>
              <p>
                @if (c.favEmail) { {{ c.favEmail }} }
                @if (c.favPhone) { · {{ c.favPhone }} }
                @if (c.favZipCode) { · {{ c.favZipCode }} }
              </p>
              <p>{{ i18n().duplicate_tenants() }}: {{ c.tenants.join(', ') }}</p>
            </ion-label>
            <ion-button slot="end" fill="outline">{{ i18n().select() }}</ion-button>
          </ion-item>
        }
      </ion-list>
    </ion-content>
    <ion-footer>
      <ion-toolbar>
        <ion-button slot="end" fill="clear" (click)="createNew()">{{ i18n().duplicate_create_new() }}</ion-button>
      </ion-toolbar>
    </ion-footer>
  `,
})
export class PersonDuplicateModal {
  private readonly modalController = inject(ModalController);

  public candidates = input.required<PersonDuplicateCandidate[]>();
  public i18n = input.required<PersonI18n>();

  protected select(candidate: PersonDuplicateCandidate): void {
    this.modalController.dismiss(candidate, 'select');
  }

  protected createNew(): void {
    this.modalController.dismiss(null, 'create');
  }
}
```

- [ ] **Step 2: Export from the feature barrel**

Add to `libs/subject/person/feature/src/index.ts`:

```typescript
export { PersonDuplicateModal } from './lib/person-duplicate.modal';
```

- [ ] **Step 3: Type-check the feature lib**

Run: `npx tsc --noEmit -p libs/subject/person/feature/tsconfig.json`
Expected: errors only from `person.store.ts` referencing the removed `checkIfExists` (fixed in Task 8). The new modal file itself must be error-free.

- [ ] **Step 4: Commit**

```bash
git add libs/subject/person/feature/src/lib/person-duplicate.modal.ts libs/subject/person/feature/src/index.ts
git commit -m "feat(person): PersonDuplicateModal candidate list"
```

---

## Task 7: `PersonReconcileModal`

**Files:**
- Create: `libs/subject/person/feature/src/lib/person-reconcile.modal.ts`
- Modify: `libs/subject/person/feature/src/index.ts`

- [ ] **Step 1: Write the modal component**

The modal computes the diffs once, maps each field to its existing i18n label, tracks a per-field choice (`existing` by default), and on save returns only the fields where the user chose `new`.

```typescript
// libs/subject/person/feature/src/lib/person-reconcile.modal.ts
import { Component, computed, inject, input, signal } from '@angular/core';
import { IonContent, IonItem, IonLabel, IonList, IonSegment, IonSegmentButton, ModalController } from '@ionic/angular/standalone';

import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@bk2/shared-ui';
import {
  computePersonFieldDiffs,
  PersonDuplicateCandidate,
  PersonFieldDiff,
  PersonI18n,
  PersonNewFormModel,
  ReconcilableField,
} from '@bk2/subject-person-util';

/** Maps each reconcilable field to its existing person-i18n label key. */
const FIELD_LABEL: Record<ReconcilableField, keyof PersonI18n> = {
  firstName: 'firstName_label',
  lastName: 'lastName_label',
  gender: 'gender_label',
  dateOfBirth: 'dateOfBirth_label',
  dateOfDeath: 'dateOfDeath_label',
  ssnId: 'ssnId_label',
  favEmail: 'email_label',
  favPhone: 'phone_label',
  favZipCode: 'zipCode_label',
};

@Component({
  selector: 'bk-person-reconcile-modal',
  standalone: true,
  imports: [Header, ChangeConfirmation, IonContent, IonList, IonItem, IonLabel, IonSegment, IonSegmentButton],
  template: `
    <bk-header [i18n]="{ title: i18n().reconcile_title() }" [isModal]="true" />
    <bk-change-confirmation [i18n]="confirmationI18n()" (cancelClicked)="cancel()" (saveClicked)="save()" />
    <ion-content class="ion-padding">
      <p>{{ i18n().reconcile_intro() }}</p>
      <ion-list>
        @for (d of diffs(); track d.field) {
          <ion-item lines="none">
            <ion-label>
              <h2>{{ labelFor(d.field) }}</h2>
              <ion-segment [value]="choiceFor(d.field)" (ionChange)="choose(d.field, $event.detail.value)">
                <ion-segment-button value="existing">
                  <ion-label>{{ i18n().reconcile_keep_existing() }}: {{ d.existingValue || '—' }}</ion-label>
                </ion-segment-button>
                <ion-segment-button value="new">
                  <ion-label>{{ i18n().reconcile_use_new() }}: {{ d.newValue }}</ion-label>
                </ion-segment-button>
              </ion-segment>
            </ion-label>
          </ion-item>
        }
      </ion-list>
    </ion-content>
  `,
})
export class PersonReconcileModal {
  private readonly modalController = inject(ModalController);

  public existing = input.required<PersonDuplicateCandidate>();
  public form = input.required<PersonNewFormModel>();
  public i18n = input.required<PersonI18n>();

  protected readonly diffs = computed<PersonFieldDiff[]>(() => computePersonFieldDiffs(this.existing(), this.form()));
  // per-field choice; 'existing' is the default (keep current data).
  private readonly choices = signal<Record<string, 'existing' | 'new'>>({});

  protected readonly confirmationI18n = computed(() => ({
    cancel: this.i18n().cancel(),
    save: this.i18n().save(),
  } as ChangeConfirmationI18n));

  protected labelFor(field: ReconcilableField): string {
    return this.i18n()[FIELD_LABEL[field]]();
  }

  protected choiceFor(field: ReconcilableField): 'existing' | 'new' {
    return this.choices()[field] ?? 'existing';
  }

  protected choose(field: ReconcilableField, value: unknown): void {
    const choice = value === 'new' ? 'new' : 'existing';
    this.choices.update((c) => ({ ...c, [field]: choice }));
  }

  protected save(): void {
    const resolved: Partial<Record<ReconcilableField, string>> = {};
    for (const d of this.diffs()) {
      if (this.choiceFor(d.field) === 'new') resolved[d.field] = d.newValue;
    }
    this.modalController.dismiss(resolved, 'confirm');
  }

  protected cancel(): void {
    this.modalController.dismiss(null, 'cancel');
  }
}
```

Note: the `ion-segment` `[value]` binds to `choiceFor(d.field)` (current choice) and `(ionChange)` calls `choose(d.field, ...)`. Keep those two method names exact.

- [ ] **Step 2: Export from the feature barrel**

Add to `libs/subject/person/feature/src/index.ts`:

```typescript
export { PersonReconcileModal } from './lib/person-reconcile.modal';
```

- [ ] **Step 3: Type-check the feature lib**

Run: `npx tsc --noEmit -p libs/subject/person/feature/tsconfig.json`
Expected: errors only from `person.store.ts` (`checkIfExists`), fixed next. The reconcile modal file must be error-free.

- [ ] **Step 4: Commit**

```bash
git add libs/subject/person/feature/src/lib/person-reconcile.modal.ts libs/subject/person/feature/src/index.ts
git commit -m "feat(person): PersonReconcileModal per-field diff picker"
```

---

## Task 8: Rewire `PersonStore.add()`

**Files:**
- Modify: `libs/subject/person/feature/src/lib/person.store.ts`

- [ ] **Step 1: Replace the `add()` method body**

Replace the whole `add()` method ([person.store.ts:162-200](../../libs/subject/person/feature/src/lib/person.store.ts#L162-L200)) with:

```typescript
        async add(readOnly = true): Promise<void> {
            if (readOnly) return;
            const { PersonNewModal } = await import('./person-new.modal');
            const modal = await store.modalController.create({
                component: PersonNewModal,
                componentProps: { org: store.appStore.defaultOrg() }
            });
            modal.present();
            const { data, role } = await modal.onWillDismiss();
            if (role !== 'confirm' || !data) return;
            const p = data as PersonNewFormModel;

            // Cross-tenant duplicate search (callable; memberAdmin-gated server-side).
            const candidates = await store.personService.findDuplicates({
                firstName: p.firstName, lastName: p.lastName, dateOfBirth: p.dateOfBirth,
                favEmail: p.email, ssnId: p.ssnId,
            });

            if (candidates.length === 0) {
                await this.createNewPerson(p);
                return;
            }

            const { PersonDuplicateModal } = await import('./person-duplicate.modal');
            const dupModal = await store.modalController.create({
                component: PersonDuplicateModal,
                cssClass: 'list-modal',
                componentProps: { candidates, i18n: store.i18n }
            });
            dupModal.present();
            const { data: chosen, role: dupRole } = await dupModal.onWillDismiss();

            if (dupRole === 'create') {
                await this.createNewPerson(p);
            } else if (dupRole === 'select' && chosen) {
                await this.reusePerson(chosen as PersonDuplicateCandidate, p);
            }
        },

        /** Creates a brand-new person plus its address records and optional membership. */
        async createNewPerson(p: PersonNewFormModel): Promise<void> {
            const personKey = await store.personService.create(convertFormToNewPerson(p, store.tenantId()), store.currentUser());
            const avatarKey = `person.${personKey}`;
            if ((p.email ?? '').length > 0) this.saveAddress(convertNewPersonFormToEmailAddress(p, store.tenantId()), avatarKey);
            if ((p.phone ?? '').length > 0) this.saveAddress(convertNewPersonFormToPhoneAddress(p, store.tenantId()), avatarKey);
            if ((p.web ?? '').length > 0) this.saveAddress(convertNewPersonFormToWebAddress(p, store.tenantId()), avatarKey);
            if ((p.city ?? '').length > 0) this.saveAddress(convertNewPersonFormToPostalAddress(p, store.tenantId()), avatarKey);
            if (p.shouldAddMembership && (p.orgKey ?? '').length > 0 && (p.membershipCategory ?? '').length > 0) {
                await this.saveMembership(p, personKey);
            }
        },

        /**
         * Reuses an existing person: reconcile differing fields, share into the current tenant,
         * add any new contact channels, and optionally create a membership.
         */
        async reusePerson(candidate: PersonDuplicateCandidate, p: PersonNewFormModel): Promise<void> {
            const { PersonReconcileModal } = await import('./person-reconcile.modal');
            const recModal = await store.modalController.create({
                component: PersonReconcileModal,
                componentProps: { existing: candidate, form: p, i18n: store.i18n }
            });
            recModal.present();
            const { data: resolved, role } = await recModal.onWillDismiss();
            if (role !== 'confirm') return;

            await store.personService.mergeIntoTenant(
                candidate.bkey, store.tenantId(),
                (resolved ?? {}) as Partial<Record<ReconcilableField, string>>);

            // Non-destructive: add contact channels not already represented by the person's fav fields.
            const avatarKey = `person.${candidate.bkey}`;
            if ((p.email ?? '').length > 0 && p.email !== candidate.favEmail) this.saveAddress(convertNewPersonFormToEmailAddress(p, store.tenantId()), avatarKey);
            if ((p.phone ?? '').length > 0 && p.phone !== candidate.favPhone) this.saveAddress(convertNewPersonFormToPhoneAddress(p, store.tenantId()), avatarKey);
            if ((p.web ?? '').length > 0) this.saveAddress(convertNewPersonFormToWebAddress(p, store.tenantId()), avatarKey);
            if ((p.city ?? '').length > 0) this.saveAddress(convertNewPersonFormToPostalAddress(p, store.tenantId()), avatarKey);
            if (p.shouldAddMembership && (p.orgKey ?? '').length > 0 && (p.membershipCategory ?? '').length > 0) {
                await this.saveMembership(p, candidate.bkey);
            }
            this.reload();
        },
```

- [ ] **Step 2: Update the util import to include the new types**

In the `@bk2/subject-person-util` import line ([person.store.ts:19](../../libs/subject/person/feature/src/lib/person.store.ts#L19)), add `PersonDuplicateCandidate` and `ReconcilableField`:

```typescript
import { convertFormToNewPerson, convertNewPersonFormToEmailAddress, convertNewPersonFormToMembership, convertNewPersonFormToPhoneAddress, convertNewPersonFormToPostalAddress, convertNewPersonFormToWebAddress, PersonNewFormModel, PERSON_I18N_KEYS, PersonI18n, PersonDuplicateCandidate, ReconcilableField } from '@bk2/subject-person-util';
```

- [ ] **Step 3: Type-check the whole feature lib**

Run: `npx tsc --noEmit -p libs/subject/person/feature/tsconfig.json`
Expected: no errors (the `checkIfExists` reference is gone, the new helpers resolve).

- [ ] **Step 4: Commit**

```bash
git add libs/subject/person/feature/src/lib/person.store.ts
git commit -m "feat(person): duplicate-aware add() flow with reconcile + reuse"
```

---

## Task 9: Lint + build verification

**Files:** none (verification only)

- [ ] **Step 1: Lint the touched projects**

Run each (per the eslint skill — one project per invocation to avoid the heap OOM):
```bash
pnpm nx lint subject-person-util
pnpm nx lint subject-person-data-access
pnpm nx lint subject-person-feature
```
Expected: no lint errors. Fix any reported.

- [ ] **Step 2: Build the feature lib (declaration/rootDir sanity)**

Run: `pnpm nx build subject-person-feature`
Expected: build succeeds, output under `dist/`.

- [ ] **Step 3: Run the util tests once more**

Run: `pnpm nx test subject-person-util`
Expected: PASS.

- [ ] **Step 4: Final commit (if lint produced fixes)**

```bash
git add -A
git commit -m "chore(person): lint + build fixes for duplicate detection"
```

---

## Deployment note (out of band)

The two new callables must be deployed before the client flow works end-to-end: use the
`firebase-deploy` skill (`pnpm run deploy:functions`). App Check is enforced — verify from a real
build, not an unconfigured localhost (see the `appcheck-localhost-dev` memory).

---

## Self-Review notes

- **Spec coverage:** match semantics (Task 3 queries), cross-tenant search (Task 3 `findPersonDuplicates`), candidate-list modal (Task 6), reuse + share into tenant (Task 3 `mergePersonIntoTenant` + Task 8 `reusePerson`), per-field reconcile (Task 2 util + Task 7 modal), scalar + contact-channel scope (Task 8 address re-adds), no privacy filtering / memberAdmin gate (Task 3 `requireMemberAdmin`), i18n (Task 5). All spec sections map to a task.
- **Type consistency:** `PersonDuplicateCandidate`, `ReconcilableField`, `FindPersonDuplicatesRequest/Response`, `MergePersonIntoTenantRequest/Response` defined in Task 1 and used identically in Tasks 3/4/6/7/8. Method names `findDuplicates`/`mergeIntoTenant` consistent between service (Task 4) and store (Task 8). Modal dismiss roles (`select`/`create`/`confirm`/`cancel`) consistent between Tasks 6/7 and the store consumer (Task 8).
- **Accepted simplifications** (from spec) are preserved: case-sensitive `lastName` query; fav-field address dedupe heuristic.

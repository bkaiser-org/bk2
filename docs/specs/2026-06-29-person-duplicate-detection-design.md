# Person Duplicate Detection & Reconciliation (add-person flow)

**Date:** 2026-06-29
**Type:** Design
**State:** Awaiting implementation

## Problem

When a `memberAdmin` adds a new person, the only duplicate guard today is
`PersonService.checkIfExists()` ([person.service.ts:106-117](../../libs/subject/person/data-access/src/lib/person.service.ts#L106-L117)),
which:

- matches **only** on `firstName` + `lastName` (case-insensitive),
- runs against the **already-loaded, tenant-scoped** `persons` array (so it cannot see persons that
  belong to other tenants — yet persons are shared across tenants), and
- only raises a yes/no confirm alert ([person.store.ts:176-178](../../libs/subject/person/feature/src/lib/person.store.ts#L176-L178)).

This lets an admin accidentally create a duplicate of a person who already exists — most often a person
who lives in *another* tenant and is invisible to the client query.

## Goals

1. Detect potential duplicates on a richer set of identifiers.
2. Search **across all tenants**, not just the current one.
3. Replace the confirm alert with a **modal listing the matching persons** (enough attributes to decide).
4. Let the admin **select an existing person** (reuse) or **create a new one anyway**.
5. When reusing, **reconcile differing fields** between the form input and the existing person.

## Non-goals

- No privacy filtering on the candidate attributes — this flow is gated to `memberAdmin`/`admin`, who
  are entitled to see all attributes.
- No general-purpose person-merge / de-dup tool for already-existing duplicates (separate effort).
- No change to `shared-models` (`PersonModel` already has every field we need).

## Match semantics ("any identifier")

A person is a **candidate** if **any** of the following matches the form input:

| Identifier | Rule |
|---|---|
| name | `lastName` equals **and** `firstName` equals (case-insensitive) |
| date of birth | `dateOfBirth` equals |
| email | `favEmail` equals |
| SSN | `ssnId` equals |

All four match fields exist directly on `PersonModel`
([person.model.ts:12-21](../../libs/shared/models/src/lib/person.model.ts#L12-L21)) — no address-collection
join is required.

## Why Cloud Functions are required

`firestore.rules` enforces tenant isolation on every person read and write:
`belongsToTenant(resource.data)` requires the doc's `tenants[]` to intersect the caller's tenants
([firestore.rules:47-58](../../firestore.rules#L47-L58)). Therefore:

- A client query **cannot** return persons of other tenants → the search must run server-side
  (admin SDK bypasses rules).
- Updating an other-tenant person (to share it into the current tenant) is **also** rules-blocked
  client-side → the merge must run server-side too.

This matches the project rule that privileged / cross-tenant operations go through a Cloud Function.

## Architecture

### Cloud Functions (`apps/functions/src/person/`, region `europe-west6`)

Both functions guard with `checkAppCheckToken`, `checkAuthentication`, and
`requireRole(request, <name>, ['admin', 'memberAdmin'])` (the helper already used in
`matrix-simple/index.ts`). Registered in `apps/functions/src/main.ts`.

**`findPersonDuplicates`**
- Input: `{ firstName, lastName, dateOfBirth, favEmail, ssnId }` (only the candidate fields).
- Runs up to 4 **single-field equality** queries across the whole `persons` collection
  (no tenant filter, no `isArchived` filter): `ssnId ==`, `favEmail ==`, `dateOfBirth ==`, `lastName ==`.
  Single-field equality uses Firestore's automatic indexes — **no composite indexes needed.**
- Unions results by doc id; then **in memory**: drops `isArchived === true`, and for the name query
  keeps only rows whose `firstName` matches case-insensitively.
- Output: `{ candidates: PersonDuplicateCandidate[] }`, each candidate carrying `bkey`, all scalar
  attributes, and `tenants[]`. No attribute is stripped.

**`mergePersonIntoTenant`**
- Input: `{ personKey, tenantId, resolvedFields }` where `resolvedFields` is a partial set of scalar
  person fields chosen in the reconcile step.
- `arrayUnion(tenantId)` into `tenants[]` (idempotent — safe when the person is already in the tenant),
  applies `resolvedFields`, recomputes `index` (`getPersonIndex` from `@bk2/subject-person-util`),
  writes, returns the updated person.

### Shared types (`@bk2/subject-person-util`)

`PersonDuplicateCandidate`, `FindPersonDuplicatesRequest/Response`, `MergePersonIntoTenantRequest`.
Defined in util so both the functions and the app import them.

### Client service (`PersonService`)

- Remove `checkIfExists`.
- Add `findDuplicates(form): Promise<PersonDuplicateCandidate[]>` and
  `mergeIntoTenant(personKey, tenantId, resolvedFields): Promise<PersonModel>` — `httpsCallable`
  wrappers using `getFunctions(getApp(), 'europe-west6')` (same pattern as `ZefixService`).

### UI — two new feature modals

**`PersonDuplicateModal`** (`libs/subject/person/feature`)
- Inputs: `candidates: PersonDuplicateCandidate[]`.
- Lists each candidate showing: full name, gender, `dateOfBirth`, `ssnId`, `favEmail`, `favPhone`,
  `favZipCode`, and **tenant badges** (which tenants the person belongs to).
- Per-row **Select** action; footer button **"Create new anyway"**.
- Dismiss roles: `select` (data = chosen candidate) / `create` / cancel (backdrop).

**`PersonReconcileModal`** (`libs/subject/person/feature`)
- Inputs: `existing: PersonDuplicateCandidate`, `form: PersonNewFormModel`.
- Shows **only the fields that differ** (per-field diff) with an existing-vs-new toggle, default = existing.
- Returns the resolved scalar field values (role `confirm`).

### Pure logic (`@bk2/subject-person-util`, + Vitest unit test)

`computePersonFieldDiffs(existing, form)` → list of `{ field, existingValue, newValue }` for the
reconcilable scalar fields: `firstName, lastName, gender, dateOfBirth, dateOfDeath, ssnId, favEmail,
favPhone, favZipCode`. Unit-tested per the project QA rule.

### New `PersonStore.add()` flow

```
form confirmed
  → candidates = personService.findDuplicates(p)
  → if candidates.length === 0:
        create new person (unchanged from today)
  → else open PersonDuplicateModal(candidates):
        role 'create'  → create new person (as today)
        role 'select'  → open PersonReconcileModal(existing=candidate, form=p)
                          → resolved = scalar values
                          → personService.mergeIntoTenant(candidate.bkey, tenantId, resolved)
                          → create AddressModel records for non-empty form channels
                            (email/phone skipped when equal to the person's fav value;
                             web/postal added)
                          → optional membership if shouldAddMembership
                          → reload
        cancel         → abort
```

### i18n

New keys in `person-i18n.ts` (+ `feature/src/i18n/de.json`, and `en.json` if present): duplicate-modal
title, "select", "create new anyway", reconcile-modal title, "keep existing" / "use new", and the
reconcilable field labels. Wired through the store i18n pattern.

## Accepted simplifications

- **Name case in `lastName`**: the name query matches `lastName` exactly (case-sensitive in Firestore);
  only `firstName` is compared case-insensitively in memory. A differing-case last name would be missed.
  The `ssnId` / `favEmail` / `dateOfBirth` queries still catch most such cases.
- **Address dedupe** on reuse is a fav-field heuristic (compare to `favEmail`/`favPhone`), not a full
  scan of the `addresses` collection. `web`/`postal` channels have no fav field, so they are always
  added when non-empty (minor duplication risk).

## Files touched

**New**
- `apps/functions/src/person/index.ts` — `findPersonDuplicates`, `mergePersonIntoTenant`
- `libs/subject/person/feature/src/lib/person-duplicate.modal.ts`
- `libs/subject/person/feature/src/lib/person-reconcile.modal.ts`
- `libs/subject/person/util/src/lib/person-duplicate.model.ts` — shared types
- `libs/subject/person/util/src/lib/person-field-diff.util.ts` + `.spec.ts`

**Changed**
- `apps/functions/src/main.ts` — register the two functions
- `libs/subject/person/data-access/src/lib/person.service.ts` — remove `checkIfExists`, add the two callables
- `libs/subject/person/feature/src/lib/person.store.ts` — new `add()` flow
- `libs/subject/person/util/src/lib/person-i18n.ts` + `feature/src/i18n/de.json` — i18n keys
- util/feature `index.ts` barrels — export new symbols

## Open questions

None outstanding — match semantics, cross-tenant mechanism, select behavior, reconcile UX, and field
scope were all confirmed during brainstorming.

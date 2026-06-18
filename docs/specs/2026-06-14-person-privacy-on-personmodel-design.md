# Person Privacy Preferences on PersonModel — Design

**Date:** 2026-06-14
**Status:** approved, ready for implementation plan
**Author:** Bruno Kaiser (with Claude)

## Problem

Members can configure, in their own profile, how their sensitive attributes are shared
(`usage*`: name, date of birth, email, phone, postal address, images). Each sensitive
field also has a tenant-wide default accessor (`show*` in `AppConfig` / `PrivacySettings`).
When a member views another person's detail view, that person's attributes are shown
according to the **stricter** of the per-person `usage*` preference and the tenant default
`show*` (`AppStore.getPersonPrivacySettings`).

The `usage*` preference is stored on `UserModel` (`users` collection). A recent tightening
of `firestore.rules` restricts `users` reads to the owner (by uid `get`) or privileged
roles — a list query is denied for non-privileged users. `PersonStore.personUserModelResource`
issues exactly such a list query (`userService.readByPersonKey`), so for a registered
(non-privileged) viewer the `rxResource` errors and surfaces in change detection as:

```
ResourceValueError: Resource is currently in an error state ...
Missing or insufficient permissions.
```

As a result the per-person privacy mechanism no longer works for registered users.

## Key context

- The **sensitive attributes themselves are already readable** by any authenticated tenant
  member: `dateOfBirth` lives on `PersonModel` (`persons`, `allow read: if tenantRead()`),
  and `iban`/`email`/`phone`/`postal` live on `AddressModel` (`addresses`, `tenantRead()`).
  Today's `usage*`/`show*` mechanism is therefore **client-side display filtering only** —
  it hides fields in the UI; it never prevented SDK reads of the raw data.
- The recent rules change locked down `UserModel` (where `usage*` lives), so only the
  *preference* became unreadable, not the data it governs.
- `persons` already allows `update: if tenantCreate()` — any tenant member can write person
  docs, so no new write rule is needed.
- `profile.store.save()` already persists **both** the person and the user in one action.
- `getPersonPrivacySettings` has a single consumer: `PersonStore` (`person.store.ts:136`),
  which already holds the loaded person.

## Goal (this design)

Restore UX-level honoring of per-person privacy preferences for all viewers, by moving the
preference to a location members can already read. This is **not** real security (raw data
remains readable) — that is a separate, larger effort (see Out of Scope).

## Decision

Move the six display-privacy fields from `UserModel` to `PersonModel`. `srvEmail` stays on
`UserModel` (it is an SRV-forwarding opt-out, not a display-privacy preference, and is not
part of the privacy combiner).

## Design

### 1. Data model (`shared/models`) — schema change (approved)

Add to `PersonModel` (same field names and `PrivacyUsage` type as today on `UserModel`):

| Field | Default |
|---|---|
| `usageImages` | `PrivacyUsage.Public` |
| `usageName` | `PrivacyUsage.Restricted` |
| `usageDateOfBirth` | `PrivacyUsage.Restricted` |
| `usageEmail` | `PrivacyUsage.Restricted` |
| `usagePhone` | `PrivacyUsage.Restricted` |
| `usagePostalAddress` | `PrivacyUsage.Restricted` |

The same six fields are removed from `UserModel` (deprecate-then-delete; see step 5).
`srvEmail` remains on `UserModel`.

### 2. Migration (one-time)

A backfill (Cloud Function or admin script) iterates `users`; for each user with a
`personKey`, copy `user.usage*` → `person.usage*`, only where the person still holds the
default value (don't clobber an already-set person preference). Idempotent; run once, after
the model change is deployed and before reads are flipped to the person.

### 3. Read path

- `AppStore.getPersonPrivacySettings(person: PersonModel)` — change the parameter type from
  `UserModel` to `PersonModel`; field reads are unchanged (same names).
- `PersonStore.privacySettings = computed(() => state.appStore.getPersonPrivacySettings(state.person()))`,
  using the already-loaded person. **Delete `personUserModelResource`** and the
  `userService` dependency it introduced. This removes the denied `users` query entirely and
  makes the interim permission gating fix obsolete (remove it).

### 4. Write path

- The profile privacy accordion binds `usage*` to the **person** form data (profile-edit
  already manages both person and user form data); `srvEmail` stays bound to the user.
  `profile.store.save()` already persists both — no new write path.

### 5. Cleanup (deprecate → delete)

Move the privacy form/validation/i18n pieces from `user-util` to `subject-person-util`:
`convertUserToPrivacyForm` → person equivalent, `user-privacy-form.model`,
`user-privacy-form.validations`, and the `usage*` keys/labels. Remove `usage*` from
`UserModel`, `user.util` defaults, and `user.validations`. To bound blast radius, the
implementation plan may first deprecate the `UserModel` fields (stop reading/writing) and
delete them in a follow-up step once the person path is verified.

### 6. Deploy order

1. Add `usage*` to `PersonModel` (with defaults); deploy models.
2. Run migration backfill.
3. Switch read (`getPersonPrivacySettings` + `PersonStore`) and write (profile form) to the
   person; remove `personUserModelResource` + interim gating.
4. Remove `usage*` from `UserModel` and clean up `user-util`.

## Out of scope (future, separate spec)

Real server-side enforcement: lock down `persons`/`addresses` reads to privileged/own-record
and serve **sanitized projections** via a `getPersonView` Cloud Function that reads with
admin rights and returns only the fields permitted by the viewer's role + the person's
`usage*`. This is the only way to achieve actual privacy and touches every person/address
read path. Note: `iban` has no `usage*` flag today and would be covered there.

## Related work (same debugging session, separate fixes)

- `ion-select` blank category values — fixed in `libs/shared/ui/src/lib/category-old.ts`
  via `[selectedText]` (Ionic async-label snapshot race). Unrelated to this design.
- Interim crash fix — `PersonStore.personUserModelResource` params gated to privileged;
  superseded and removed by step 3 of this design.

---
name: tenant-model
description: Use when working with multi-tenancy, tenant isolation, the `tenants[]` field, the current-user/roles model, persons or users across tenants, or `app-config` — e.g. provisioning a tenant, writing a tenant-scoped query, deciding whether a person/user is shared, or reasoning about who is admin where.
---

# Tenant & Identity Model

How multi-tenancy, identity, and authorization work in this monorepo. Reference for any work that
touches tenant scoping, persons/users, roles, or `app-config`.

## Core rule: one shared Firebase project, many tenants

All tenants live in **one** Firebase project (`bkaiser-org`) — shared Firestore, rules, functions.
A "tenant" is **not** a Firebase project; it is a logical boundary identified by a **bare string**
`tenantId` (e.g. `scs`, `acme`). Each tenant has its own app build `{tenantId}-app`, whose
`environment.ts` carries `tenantId` (from `ENV.tenantId`, derived from the Nx project name).

## Isolation: the `tenants[]` field + `array-contains`

Every persisted model has `tenants: string[]` (via `BkModel`/`PersistedModel` in
`libs/shared/models/.../base.model.ts`). Tenant-scoped reads filter with `getSystemQuery(tenantId)`
(`libs/shared/util-core/.../query.util.ts`):

```ts
[ { key: 'isArchived', operator: '==', value: false },
  { key: 'tenants',    operator: 'array-contains', value: tenantId } ]
```

On write, `FirestoreService` stamps `tenants = [ENV.tenantId]`. Each model constructor takes
`tenantId` and sets `this.tenants = [tenantId]`. **No model factory functions exist** — instantiate
the class (`new PageModel(tenantId)`, etc.).

## AppConfig — one doc per tenant

`app-config/{tenantId}` (`AppConfigCollection = 'app-config'`), **doc id = tenantId**.
`new AppConfig(tenantId)` seeds defaults; `appConfigService.create/read/update(config, tenantId)`.
Loaded by `AppStore` as `appConfig()`.

## Persons are SHARED across tenants

`PersonModel` (`persons`) is **one document that can belong to several tenants** — reuse a person
in another tenant by **appending** the id (`person.tenants.push(tenantId)` → `personService.update`),
never by duplicating. `AppStore.allPersons()` is filtered to the *current* tenant
(`array-contains`); a person from another tenant must be read by `personKey` (admin).

## Users are keyed by Firebase uid and are SINGLE-tenant

- `UserModel` (`users`) **doc id (`bkey`) = the Firebase `uid`**. `AppStore` resolves the logged-in
  user by reading **`users/{uid}`** directly (see `currentUserResource` in
  `libs/shared/feature/.../app.store.ts`).
- ⇒ **one Firebase identity = one `UserModel` = exactly one tenant** (the model comments "user has
  always exactly one tenant"). To administer two tenants, a person needs **two** Firebase accounts
  (two emails → two uids → two single-tenant users). A person with multiple user accounts is
  possible (`userService.readByLoginEmail`), but each user doc stays single-tenant.
- Consequence: if `users/{uid}` already exists bound to tenant X, you **cannot** also bind that uid
  to tenant Y (same doc id) without clobbering X — use a different admin email for Y.

`UserModel.personKey` links to the `PersonModel`. `createUserFromPerson(person, tenantId)`
(`libs/aoc/util/.../adminops.util.ts`) builds a `UserModel` (`roles:{registered:true}`).

## Roles live on the UserModel (and are effectively per-tenant)

`UserModel.roles: Roles` (`libs/shared/models/.../roles.ts`: `admin`, `privileged`, `contentAdmin`,
`memberAdmin`, `treasurer`, `auditor`, `registered`, …). Checked via `hasRole(role, currentUser)`
(`libs/shared/util-core/.../auth.util.ts`) — the check reads the current user's `roles` with no
tenant argument. Because the user is single-tenant, a user's roles only ever apply within that one
tenant, so granting `admin` is safe and tenant-local.

## Finding existing identities

| Goal | How |
|---|---|
| Firebase uid for an email | `getUidByEmail(email)` (CF, `adminops.util.ts`) |
| UserModel for a uid | `userService.read(uid)` (reads `users/{uid}`) |
| UserModel for an email | `userService.readByLoginEmail(email)` |
| Person in current tenant | `AppStore.allPersons()` / search by `favEmail`/name |
| Person in another tenant | `personService.read(personKey)` (admin) |
| Create Firebase account | `createFirebaseAccount(email, password, displayName)` → uid |

## Related
- Contact details (a person's `favEmail`/`favPhone` come from favorite addresses): **`address-model`** skill.
- Provisioning a whole new tenant: **`provision-tenant`** skill.
- Deploying / environment generation: **`firebase-deploy`** skill.
- A second-level **accounting** tenant (`accountingTenantId`) scopes finance data within a tenant —
  see the finance libs; out of scope here.

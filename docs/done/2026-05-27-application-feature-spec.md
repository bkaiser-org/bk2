# Application Feature Specification

**Version:** 1.6
**Date:** 2026-05-27
**Status:** Draft (rev 6: resolved Q11 — email send uses TO = favorite email, CC = cc-addresses (no BCC). Resolved Q12 — parent gender defaults to `'female'`)
**Domain:** `libs/subject/application`

---

## 1. Overview

The application feature lets prospective members submit a membership application. Submissions arrive through a public CMS page rendered by **FormSection** (see [2026-05-27-forms-builder-spec.md](2026-05-27-forms-builder-spec.md)); how the form is rendered and posted is owned by the FormsBuilder feature and is **out of scope** here. Each successful submission is persisted as an `ApplicationModel` and triggers a task for the responsible approver (`ResponsibilityModel` with `name = 'application'`). The approver reviews the data, optionally edits it after clarifying with the applicant, and either accepts or denies the application.

Acceptance creates only the `PersonModel` (plus its `AddressModel`). Membership creation and group invitations are deliberately **separate, explicit actions** (`add-membership`, `add-to-group`) on the list, so the approver can decide case by case.

### 1.1 Goals

- Auditable approval workflow with a clear state machine.
- One-click promotion of an approved application into a `PersonModel` + `AddressModel`.
- Discrete, opt-in follow-up actions for membership and group invitations — never automatic.
- Email touchpoints: confirmation on submit, decision notification on accept/deny — via the existing Mailgun Cloud Function.
- Reuse existing primitives: `TaskModel`, `ResponsibilityModel`, `PersonModel`, `MembershipModel`, `GroupModel`.

### 1.2 Out of scope (this iteration)

- The public submission page itself (rendered by FormSection — built later).
- Anonymous CAPTCHA / rate-limiting (handled by FormsBuilder spam protection).
- Document upload (e.g. parental consent PDF). Treated as a follow-up task after acceptance.
- Payment collection at application time.
- Multi-tenant cross-club transfer flows beyond the single `applicationAs = 'transfer'` marker.
- Automatic account creation. Approvers open accounts manually via the existing finance feature when needed.

---

## 2. Actors and Roles

| Actor | Role / condition | Write access |
| --- | --- | --- |
| Applicant (anonymous or authenticated) | Public web form visitor | Create only (own application) |
| Approver | `responsibleAvatar` of `ResponsibilityModel` where `name = 'application'` | Full CRUD on applications |
| Admin | `roles.admin === true` | Full CRUD |
| Registered member | `roles.registered === true` | Read-only on their own application |

> The `application` responsibility must exist in the `responsibilities` collection (see [responsibility.model.ts](libs/shared/models/src/lib/responsibility.model.ts) — the comment list already mentions `admission_a / admission_j / admission_k`). We reuse the generic `name = 'application'` for this feature; per-membership-category routing can be added later.

---

## 3. Data Model

### 3.1 ApplicationModel (new — to be added to `libs/shared/models/src/lib/application.model.ts`)

```typescript
import {
  DEFAULT_COUNTRY_CODE, DEFAULT_DATE, DEFAULT_EMAIL, DEFAULT_GENDER, DEFAULT_ID, DEFAULT_INDEX,
  DEFAULT_KEY, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_PHONE, DEFAULT_TAGS, DEFAULT_TENANTS
} from '@bk2/shared-constants';
import { BkModel, SearchableModel, TaggedModel } from './base.model';
import { AvatarInfo } from './avatar-info';

export class ApplicationModel implements BkModel, SearchableModel, TaggedModel {
  // base
  public bkey = DEFAULT_KEY;
  public tenants: string[] = DEFAULT_TENANTS;
  public isArchived = false;
  public index = DEFAULT_INDEX;
  public tags = DEFAULT_TAGS;
  public notes = DEFAULT_NOTES;

  // applicant — person data
  public firstName = DEFAULT_NAME;
  public lastName = DEFAULT_NAME;
  public gender: 'male' | 'female' = DEFAULT_GENDER;
  public dateOfBirth = DEFAULT_DATE;            // 'yyyymmdd' (DateFormat.storeDate)
  public ssnId = DEFAULT_ID;                    // CH AHVN13; mandatory only when applicant is < 20

  // applicant — contact channels.
  // For adult / transfer applications both are mandatory.
  // For youth applications each is conditionally optional: per channel either the kid value
  // OR the matching parent value must be present (both is also OK). See §3.5.
  public email = DEFAULT_EMAIL;
  public phone = DEFAULT_PHONE;

  // applicant — address (flat, mirrors AddressModel essentials)
  public streetName = DEFAULT_NAME;
  public streetNumber = '';
  public zipCode = '';
  public city = '';
  public countryCode = DEFAULT_COUNTRY_CODE;    // 'CH' by default

  // parent contact — used only when applicationAs === 'youth'
  public parentFirstName = DEFAULT_NAME;
  public parentLastName = DEFAULT_NAME;
  public parentEmail = DEFAULT_EMAIL;
  public parentPhone = DEFAULT_PHONE;

  // application
  public applicationAs: 'youth' | 'adult' | 'transfer' = 'adult';
  public state: ApplicationState = 'applied';

  // workflow bookkeeping
  public submittedAt = '';                      // ISO timestamp, set on create
  public reviewedAt = '';                       // ISO timestamp, set when approver opens it
  public closedAt = '';                         // ISO timestamp, set on terminal state
  public reviewer: AvatarInfo | undefined;      // approver who handled it
  public closeReason = '';                      // short comment, mandatory for closed.denied / closed.cancelled
  public personKey = DEFAULT_KEY;               // back-link to PersonModel created on approval
  public taskKey = DEFAULT_KEY;                 // back-link to TaskModel created at submission time

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const ApplicationCollection = 'applications';
export const ApplicationModelName = 'application';

export type ApplicationState =
  | 'applied'
  | 'reviewing'
  | 'closed.approved'
  | 'closed.cancelled'
  | 'closed.denied';

export const APPLICATION_STATE_VALUES = [
  'applied', 'reviewing', 'closed.approved', 'closed.cancelled', 'closed.denied'
] as const satisfies ApplicationState[];

export type ApplicationKind = 'youth' | 'adult' | 'transfer';
export const APPLICATION_KIND_VALUES = ['youth', 'adult', 'transfer'] as const satisfies ApplicationKind[];
```

> **Hard rule reminder:** schema changes require sign-off. Confirm the model shape with the team before merging it into `@bk2/shared-models`.

### 3.2 State Machine

```
            ┌──────────────┐
 submit ──▶ │   applied    │
            └──────┬───────┘
                   │ approver opens
                   ▼
            ┌──────────────┐  edit ──┐
            │   reviewing  │ ◀───────┘
            └──┬─────┬─────┘
   approve ────┘     └──── deny / cancel
        │                    │
        ▼                    ▼
 ┌──────────────┐    ┌────────────────────────┐
 │ closed.      │    │ closed.denied          │
 │ approved     │    │ closed.cancelled       │
 └──────────────┘    └────────────────────────┘
```

| From | Event | To | Side effect |
| --- | --- | --- | --- |
| `—` | submit | `applied` | create application, create task, send confirmation email |
| `applied` | open (approver action) | `reviewing` | set `reviewedAt`, set `reviewer` |
| `reviewing` | edit | `reviewing` | update record only |
| `reviewing` | accept | `closed.approved` | create `PersonModel` + `AddressModel`, set `personKey`, close task, set `closedAt`, send acceptance email |
| `applied` / `reviewing` | deny | `closed.denied` | require `closeReason`, close task, set `closedAt`, send rejection email |
| `applied` / `reviewing` | cancel | `closed.cancelled` | require `closeReason`, close task, set `closedAt` (no email) |

`add-membership` and `add-to-group` are **separate actions** (see §8.2 and §9.4), not automatic side effects of accept. They are available on the list whether the application is still open or already approved (as long as `personKey` is set).

Terminal states (`closed.*`) are immutable except `notes` and `tags`.

### 3.3 Search index

`getApplicationIndex(application)` concatenates `firstName + lastName + email + zipCode + city + applicationAs + state` via `addIndexElement` from `@bk2/shared-util-core`. Used for the list-view free-text filter. Parent fields are intentionally **excluded** from the index — the application is searchable by the applicant only, even when parent contact is filled.

### 3.4 SSN handling

`ssnId` is collected only when the applicant is younger than 20 on the application date (`applicationAs === 'youth'` or `getAgeAt(dateOfBirth, today) < 20`). When not collected, the field stays at `DEFAULT_ID` (empty string). The form hides the field otherwise. Validation: when shown and the country is `CH`, value must pass `ssnValidations` (already exists in [ssn.validations.ts](libs/subject/person/util/src/lib/ssn.validations.ts)).

### 3.5 Parent contact handling

`parentFirstName`, `parentLastName`, `parentEmail`, `parentPhone` are collected and validated **only** when `applicationAs === 'youth'`. The form hides them otherwise.

For youth applications, `email` and `phone` are still **both mandatory channels** — every accepted application must be reachable on both. But each channel only requires **one** of the two sides to be filled in:

| Channel | Valid (youth) when … |
| --- | --- |
| email | `app.email` is non-empty **OR** `app.parentEmail` is non-empty (both is fine) |
| phone | `app.phone` is non-empty **OR** `app.parentPhone` is non-empty (both is fine) |

In other words: for a youth application, the *kid* fields `email` / `phone` become conditionally optional — they are required only when the matching parent field is empty.

Additionally for youth:

- `parentFirstName` and `parentLastName` are mandatory (so we can create the parent person).

These rules guarantee that §5.4 case (a) (kid empty AND parent empty for a channel) can never reach `ApplicationService.accept()`. The vest suite blocks submission, so the service can assume coverage for both channels.

The parent fields are not stored anywhere outside the `ApplicationModel`.

---

## 4. Library Structure

```
libs/subject/application/
  util/
    src/lib/
      application.util.ts          — newApplication(), getApplicationIndex(), needsSsn(), toPersonModel()
      application.validations.ts   — vest validations for ApplicationForm
      application.util.spec.ts     — unit tests
    src/index.ts
  data-access/
    src/lib/
      application.service.ts       — ApplicationService (CRUD + list + accept/deny)
      scope.ts                     — PFX = '@application/'
    src/index.ts
  ui/
    src/lib/
      application.form.ts          — ApplicationForm (dumb)
    src/index.ts
  feature/
    src/lib/
      application.store.ts         — ApplicationStore
      application-list.ts          — ApplicationList (smart, route component)
      application-edit.modal.ts    — ApplicationEditModal (smart, modal)
    src/i18n/
      de.json
    src/index.ts
  tsconfig.json
  tsconfig.lib.json
  package.json
```

Import aliases (to add to [tsconfig.base.json](tsconfig.base.json)):

- `@bk2/application-util` → `libs/subject/application/util/src/index.ts`
- `@bk2/application-data-access` → `libs/subject/application/data-access/src/index.ts`
- `@bk2/application-ui` → `libs/subject/application/ui/src/index.ts`
- `@bk2/application-feature` → `libs/subject/application/feature/src/index.ts`

> Per the hard rules: each layer needs `tsconfig.json`, an updated `tsconfig.lib.json` with `references`, and a `package.json` scoped as `@bk2/application-<layer>`. Mirror a sibling like `libs/subject/person/<layer>/`.

---

## 5. ApplicationService (`application.service.ts`)

Follows the [PersonService](libs/subject/person/data-access/src/lib/person.service.ts) pattern.

```typescript
@Injectable({ providedIn: 'root' })
export class ApplicationService {
  list(orderBy = 'submittedAt', sortOrder: 'asc' | 'desc' = 'desc'): Observable<ApplicationModel[]>;
  read(key?: string): Observable<ApplicationModel | undefined>;
  create(application: ApplicationModel, currentUser?: UserModel): Promise<string | undefined>;
  update(application: ApplicationModel, currentUser?: UserModel): Promise<string | undefined>;
  delete(application: ApplicationModel, currentUser?: UserModel): Promise<void>;

  // workflow helpers
  beginReview(application: ApplicationModel, reviewer: AvatarInfo, currentUser?: UserModel): Promise<void>;
  accept(application: ApplicationModel, currentUser?: UserModel): Promise<string | undefined>;  // returns personKey
  deny(application: ApplicationModel, reason: string, currentUser?: UserModel): Promise<void>;
  cancel(application: ApplicationModel, reason: string, currentUser?: UserModel): Promise<void>;
}
```

No `AcceptOptions` and no provisioning flags. Accept does one thing: create the person.

### 5.1 Behaviours

- `create()` — sets `submittedAt = new Date().toISOString()`, `state = 'applied'`, `index = getApplicationIndex(...)`. After write: (a) creates a `TaskModel` (see §6) and stores its key on `application.taskKey` via a second `update()`; (b) fires the **applicant confirmation email** via the Mailgun CF (see §6.2).
- `beginReview()` — guard: `state === 'applied'`. Sets `state = 'reviewing'`, `reviewedAt`, `reviewer`. No-op when already in `reviewing`.
- `accept()` — guard: `state === 'reviewing'`. Provisions the applicant `PersonModel` plus their addresses (home address from §3.1, email/phone addresses from `application.email` / `application.phone`). When `applicationAs === 'youth'`, additionally provisions the parent person, the parent–child relation, and applies the channel-promotion rule — see §5.4. Sets `application.state = 'closed.approved'`, `closedAt`, `personKey`. Closes the linked task. Fires the **acceptance email**. Does **not** create memberships, accounts, or group invitations.
- `deny()` / `cancel()` — guard: `state ∈ {applied, reviewing}`. Requires non-empty `reason`. Sets terminal state, `closedAt`, `closeReason`. Closes the linked task. `deny()` fires the **rejection email**; `cancel()` does not send mail (the application was withdrawn or invalidated administratively).
- All write paths emit an activity log entry via `ActivityService` with topic `'application'` and verbs `create | update | begin-review | accept | deny | cancel | delete`.

### 5.2 Provisioning helpers (`application.util.ts`)

```typescript
export function toPersonModel(app: ApplicationModel, tenantId: string): PersonModel {
  const p = new PersonModel(tenantId);
  p.firstName   = app.firstName;
  p.lastName    = app.lastName;
  p.gender      = app.gender;
  p.dateOfBirth = app.dateOfBirth;
  p.ssnId       = app.ssnId;
  p.favEmail    = app.email;
  p.favPhone    = app.phone;
  p.favZipCode  = app.zipCode;
  return p;
}

export function newParentPerson(app: ApplicationModel, tenantId: string): PersonModel {
  const p = new PersonModel(tenantId);
  p.firstName  = app.parentFirstName;
  p.lastName   = app.parentLastName;
  p.gender     = 'female';          // default — gender is not collected for the parent
  // dateOfBirth / ssnId remain at defaults — not collected
  p.favEmail   = app.parentEmail;
  p.favPhone   = app.parentPhone;
  p.favZipCode = app.zipCode;       // same household assumption
  return p;
}
```

All address records (kid's home email/phone/postal, parent's email/phone, kid's postal copied onto the parent, "Eltern" custom-labeled entries) and the `PersonalRelModel` are produced by `ApplicationService.accept()` following the algorithm in §5.4 — using `createFavoriteAddress()` from [`@bk2/subject-address-util`](libs/subject/address/util/src/lib/address.util.ts) wherever possible.

### 5.3 Proposed membership category

Used by the `add-membership` action (§9.4) to pre-fill `MembershipNewModal`. Not stored on the application.

```typescript
export function proposeMembershipCategory(app: ApplicationModel, today = new Date()): 'junior' | 'active' | 'candidate' {
  const age = getAgeAt(app.dateOfBirth, today);
  if (age < 20)                       return 'junior';      // under 20 → junior
  if (app.applicationAs === 'transfer') return 'active';    // 20+ transfer → active
  return 'candidate';                                       // 20+ youth/adult → candidate
}
```

The proposed org is `appStore.defaultOrg()` (see Q9 — confirmed). Both proposals are non-binding — the approver can change them in `MembershipNewModal` before saving.

### 5.4 Accept-time provisioning algorithm

Run in order inside `ApplicationService.accept()`. All address records are produced via `createFavoriteAddress(channel, usage, value, tenantId, …)` from [`@bk2/subject-address-util`](libs/subject/address/util/src/lib/address.util.ts); the helper already sets `isFavorite = true`, `isCc = false`. After construction we set `address.parentKey` to the owning person key and persist via `addressService.create(...)`. For CC addresses (step 9 below) we override `isFavorite = false; isCc = true` after the helper returns.

Registered `addressChannel` values used: `'email'`, `'phone'`, `'postal'`. `addressUsage` values used: `'home'`, `'custom'` (with `addressUsageLabel = 'Eltern'`).

**Step 1 — Applicant person.**
```typescript
const kid = toPersonModel(application, tenantId);
const kidsKey = await personService.create(kid, currentUser);   // = kids.key
```

**Step 2 — Applicant addresses (always, if value present).**
For each non-empty applicant contact value, create a favorite home address parented to `kidsKey`:

```typescript
if (app.email) {
  const a = createFavoriteAddress('email', 'home', app.email, tenantId);
  a.parentKey = 'person.' + kidsKey;
  await addressService.create(a, currentUser);
}
if (app.phone) {
  const a = createFavoriteAddress('phone', 'home', app.phone, tenantId);
  a.parentKey = 'person.' + kidsKey;
  await addressService.create(a, currentUser);
}
if (app.streetName) {
  const a = createFavoriteAddress('postal', 'home', app.streetName, tenantId,
    app.streetNumber, '', app.zipCode, app.city, app.countryCode);
  a.parentKey = 'person.' + kidsKey;
  await addressService.create(a, currentUser);
}
```

**Step 3 — Skip the rest unless `applicationAs === 'youth'`.**
For `'adult'` and `'transfer'` applications the accept flow ends here (after steps 7–9 in the "Application close" block below). Steps 4–6 only run for youth.

**Step 4 — Parent person (youth only).**
```typescript
const parent = newParentPerson(application, tenantId);
parent.gender = 'female';   // default — gender is not collected on the form
const parentsKey = await personService.create(parent, currentUser);  // = parents.key
```

Then add the parent's own contact channels as favorite home addresses parented to `parentsKey`:

```typescript
if (app.parentEmail) {
  const a = createFavoriteAddress('email', 'home', app.parentEmail, tenantId);
  a.parentKey = 'person.' + parentsKey;
  await addressService.create(a, currentUser);
}
if (app.parentPhone) {
  const a = createFavoriteAddress('phone', 'home', app.parentPhone, tenantId);
  a.parentKey = 'person.' + parentsKey;
  await addressService.create(a, currentUser);
}
```

**Step 5 — Copy the kid's postal address to the parent (same household assumption).**
```typescript
if (app.streetName) {
  const a = createFavoriteAddress('postal', 'home', app.streetName, tenantId,
    app.streetNumber, '', app.zipCode, app.city, app.countryCode);
  a.parentKey = 'person.' + parentsKey;
  await addressService.create(a, currentUser);
}
```

**Step 6 — `parentChild` PersonalRel.**
```typescript
const rel = new PersonalRelModel(tenantId);
rel.subjectKey       = parentsKey;
rel.subjectFirstName = parent.firstName;
rel.subjectLastName  = parent.lastName;
rel.subjectGender    = parent.gender;        // 'female' default
rel.objectKey        = kidsKey;
rel.objectFirstName  = kid.firstName;
rel.objectLastName   = kid.lastName;
rel.objectGender     = kid.gender;
rel.type             = 'parentChild';
await personalRelService.create(rel, currentUser);
```

**Steps 7–10 — Per-channel "Eltern" address handling on the kid (youth only).**

The same logic runs **once for `email`** and **once for `phone`**. Let `kidValue` be the applicant's value for the channel (`app.email` / `app.phone`) and `parentValue` be the parent's (`app.parentEmail` / `app.parentPhone`). Four cases:

| Case | `kidValue` | `parentValue` | Action on the kid |
| --- | --- | --- | --- |
| **(a)** | empty | empty | **Cannot occur.** Per §3.5 the vest suite blocks submission when neither side fills a mandatory channel. If `accept()` somehow encounters this state (e.g. data was corrupted server-side), the service throws — the application stays in `reviewing` and the issue is surfaced to the approver. |
| **(b)** | present | empty | Nothing extra to do — the kid's own favorite for this channel was already created in step 2. |
| **(c)** | empty | present | Create a **favorite "Eltern"** address on the kid (parented to `kidsKey`) carrying the parent's value: `usage = 'custom'`, `addressUsageLabel = 'Eltern'`, `isFavorite = true`, `isCc = false`. This is the kid's reachable address for the channel. The parent's *own* home address with the same value was already created in step 4 with `usage = 'home'` — it is not touched here. |
| **(d)** | present | present | Create a **CC "Eltern"** address on the kid (parented to `kidsKey`) carrying the parent's value: `usage = 'custom'`, `addressUsageLabel = 'Eltern'`, `isFavorite = false`, `isCc = true`. The kid's own address from step 2 stays the favorite; the parent's value appears as a CC. |

Only (b), (c), and (d) ever execute. Cases (c) and (d) each add **one** new address record to the kid for the channel. The parent's home address (`usage = 'home'`) is fully handled in step 4 and is independent of this routine.

Reference implementation:

```typescript
async function applyParentChannel(channel: 'email' | 'phone',
                                  kidValue: string, parentValue: string,
                                  kidsKey: string): Promise<void> {
  if (!kidValue && !parentValue) {
    // case (a): can't happen — vest suite blocks this. Defensive guard only.
    throw new Error(`application/accept: channel '${channel}' has no kid or parent value`);
  }
  if (!parentValue) return;                       // case (b): nothing extra to add on the kid

  // Cases (c) and (d): add an 'Eltern'-labeled address on the kid with the parent's value.
  const a = createFavoriteAddress(channel, 'custom', parentValue, tenantId);
  a.addressUsageLabel = 'Eltern';
  a.parentKey         = 'person.' + kidsKey;

  if (kidValue) {
    // case (d): kid already has their own favorite — demote this one to CC
    a.isFavorite = false;
    a.isCc       = true;
  }
  // case (c): keep createFavoriteAddress() defaults (isFavorite = true, isCc = false)

  await addressService.create(a, currentUser);
}

await applyParentChannel('email', app.email, app.parentEmail, kidsKey);
await applyParentChannel('phone', app.phone, app.parentPhone, kidsKey);
```

**Application close (always)**

11. `applicationService.update(app)` — sets `state = 'closed.approved'`, `closedAt`, `personKey = kidsKey`.
12. `taskService.update(linkedTask)` — sets `task.state = 'closed'`, `task.completionDate`.
13. Send acceptance email (Mailgun) — see §6.2. Recipients are resolved from the kid's addresses (favorite email → TO, cc emails → CC); for case (d) this means the parent's email is automatically CC'd via the "Eltern" cc-address written in step 10.

If any step fails, the partial writes that already happened (e.g. applicant person but not parent) are left in place; the application remains in `reviewing` and the approver fixes the residue from the admin overview (§11). This is the "no rollback" policy declared for the adult flow.

---

## 6. Task Integration

At submission time, `ApplicationService.create()` issues a `TaskModel` via the existing `TaskService`:

```typescript
const task = new TaskModel(this.env.tenantId);
task.name        = `Antrag: ${app.firstName} ${app.lastName} (${app.applicationAs})`;
task.author      = getAvatarInfo(currentUser, 'user-person');   // may be undefined for anonymous submissions
task.assignee    = await this.resolveApplicationApprover();      // ResponsibilityService lookup
task.tags        = ['application', app.applicationAs];
task.priority    = 1;                                            // medium
task.dueDate     = addBusinessDaysToToday(7);                    // configurable
await this.taskService.create(task, currentUser);
```

`resolveApplicationApprover()` reads the `ResponsibilityModel` where `name === 'application'` (with `validFrom <= today <= validTo`) and returns `responsibleAvatar` (or `delegateAvatar` when the delegate window is active).

On terminal transitions, `ApplicationService.accept|deny|cancel` updates the linked task:

```typescript
task.state          = 'closed';
task.completionDate = todayStoreDate();
task.notes          = `${task.notes}\n[${app.state}] ${app.closeReason}`.trim();
await this.taskService.update(task, currentUser);
```

If the responsibility is unset, the task is created with `assignee = undefined` and an extra activity-log warning is emitted; admin sees an aoc badge (see §11).

### 6.2 Email notifications (Mailgun CF)

We reuse the existing Mailgun Cloud Function. `ApplicationService` issues a callable invocation (or — if the CF is HTTP — a `fetch` via `MailService` if one already exists; confirm during implementation) with a structured payload:

| Trigger | Template id | Subject (de) | Payload keys |
| --- | --- | --- | --- |
| `create()` | `application.confirmation` | "Wir haben Ihren Antrag erhalten" | `firstName`, `lastName`, `applicationAs`, `submittedAt` |
| `accept()`  | `application.accepted`     | "Ihr Antrag wurde angenommen"     | `firstName`, `lastName`, `applicationAs` |
| `deny()`    | `application.denied`       | "Ihr Antrag wurde nicht angenommen" | `firstName`, `lastName`, `closeReason` |
| `cancel()`  | —                          | (no mail)                          | — |

#### Recipient resolution (TO / CC)

The general rule for sending email to a person is:

- **TO** — the person's favorite email address (`AddressModel` with `addressChannel = 'email'` and `isFavorite = true`).
- **CC** — every email-channel `AddressModel` on that person with `isCc = true` (regardless of `addressUsage` — the `'Eltern'` label is informational only).

Applied to this feature:

| Mail | Person exists? | TO | CC |
| --- | --- | --- | --- |
| `application.accepted` / `application.denied` | yes (created by `accept()`) | resolved from the kid's favorite email | resolved from the kid's cc email addresses |
| `application.confirmation` | no (sent inside `create()` before any person exists) | computed from raw application fields per the table below | computed from raw application fields per the table below |

For the confirmation mail, the same TO/CC logic is computed from `application.email` / `application.parentEmail` to mirror what step 2 + steps 7–10 will write later:

| Branch | `app.email` | `app.parentEmail` | TO | CC |
| --- | --- | --- | --- | --- |
| youth (b) | present | empty   | `app.email`       | — |
| youth (c) | empty   | present | `app.parentEmail` | — |
| youth (d) | present | present | `app.email`       | `app.parentEmail` |
| adult / transfer | present | n/a | `app.email`       | — |

No mail is sent when both `app.email` and `app.parentEmail` are empty — for a youth submission this would have been blocked by §3.5; for adult/transfer the form requires `app.email` directly.

Failure to send mail must **not** roll back the application state — the mail send is logged via `ActivityService` (`application/mail-sent` or `application/mail-failed`) and surfaced to the approver via a non-blocking toast.

---

## 7. ApplicationStore (`application.store.ts`)

NgRx Signal Store, mirrors `TripStore` / `PersonStore`.

### State

```typescript
withState({
  searchTerm: '',
  stateFilter: 'open' as 'all' | 'open' | 'closed' | ApplicationState,
  kindFilter: 'all' as 'all' | ApplicationKind,
});
```

`open` is a virtual filter equivalent to `state ∈ {applied, reviewing}`; `closed` to `state.startsWith('closed.')`.

### Computed

```typescript
withComputed(store => ({
  filteredApplications: computed(() => {
    const all  = store.applicationsResource.value() ?? [];
    const term = store.searchTerm().toLowerCase();
    const sf   = store.stateFilter();
    const kf   = store.kindFilter();
    return all
      .filter(a => matchesStateFilter(a.state, sf))
      .filter(a => kf === 'all' || a.applicationAs === kf)
      .filter(a => !term || a.index.toLowerCase().includes(term))
      .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  }),
}));
```

### Methods

```typescript
withMethods(store => ({
  setSearchTerm(term: string): void;
  setStateFilter(state: string): void;
  setKindFilter(kind: string): void;

  async editApplication(app: ApplicationModel): Promise<void>;              // opens ApplicationEditModal
  async deleteApplication(app: ApplicationModel): Promise<void>;            // confirm + soft archive (isArchived = true)
  async acceptApplication(app: ApplicationModel): Promise<void>;            // confirm + service.accept (person + address only)
  async denyApplication(app: ApplicationModel): Promise<void>;              // prompt for reason, service.deny

  // Follow-up actions — available once personKey is set on the application
  async addMembership(app: ApplicationModel): Promise<void>;                // opens MembershipNewModal with proposed defaults
  async addToGroup(app: ApplicationModel): Promise<void>;                   // opens GroupSelectModal, then groupService.invite()
}));
```

`newApplication()` is intentionally absent — the submission path lives in FormSection on the public website (see §1).

### Resource

```typescript
withProps(store => ({
  applicationsResource: rxResource({
    params: () => ({ tenantId: store.appStore.tenantId() }),
    stream: () => store.applicationService.list(),
  }),
}));
```

---

## 8. ApplicationList (`application-list.ts`)

Route component. Selector: `bk-application-list`.

### 8.1 Layout

```html
<ion-header>
  <ion-toolbar color="secondary">
    <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
    <ion-title>{{ store.filteredApplications().length }} {{ store.i18n.list_title() }}</ion-title>
    <!-- No "add" button: submissions arrive via the public FormSection page -->
  </ion-toolbar>
  <bk-list-filter
    (searchTermChanged)="store.setSearchTerm($event)"
    [stateOptions]="stateOptions"
    (stateChanged)="store.setStateFilter($event)"
    [secondaryOptions]="kindOptions"
    (secondaryChanged)="store.setKindFilter($event)" />
</ion-header>

<ion-content>
  @for (app of store.filteredApplications(); track app.bkey) {
    <ion-item button (click)="store.editApplication(app)">
      <ion-avatar slot="start"><!-- gender icon --></ion-avatar>
      <ion-label>
        <h2>{{ app.lastName }}, {{ app.firstName }}</h2>
        <p>{{ app.zipCode }} {{ app.city }} · {{ store.i18n['kind_' + app.applicationAs]() }}</p>
        <p>{{ app.submittedAt | date:'dd.MM.yyyy HH:mm' }}</p>
      </ion-label>
      <ion-chip slot="end" [color]="stateColor(app.state)">{{ store.i18n['state_' + app.state.replace('.', '_')]() }}</ion-chip>
    </ion-item>
  }
  @empty {
    <ion-item><ion-label>{{ store.i18n.list_empty() }}</ion-label></ion-label></ion-item>
  }
</ion-content>
```

### 8.2 Action menu (per item)

Triggered via swipe or context menu (`ActionSheetController`).

| Action key | Label (i18n) | Shown when |
| --- | --- | --- |
| `application.edit` | Antrag bearbeiten | `state ∈ {applied, reviewing}` |
| `application.accept` | Annehmen | `state ∈ {applied, reviewing}` |
| `application.deny` | Ablehnen | `state ∈ {applied, reviewing}` |
| `application.add_membership` | Mitgliedschaft hinzufügen | `personKey !== ''` (i.e. after accept) |
| `application.add_to_group` | Zu Gruppe einladen | `personKey !== ''` |
| `application.delete` | Löschen | always (admin only) |
| `cancel` | Abbrechen | always |

`application.delete` performs a soft archive: `isArchived = true`. Hard delete is only available in the admin overview (`aoc/application`, see §11).

`add_membership` and `add_to_group` stay available indefinitely after acceptance — the approver may, for example, add a candidate to a course waitlist months before promoting them to a full membership.

### 8.3 State filter options

```typescript
const stateOptions = ['all', 'open', 'applied', 'reviewing', 'closed', 'closed.approved', 'closed.denied', 'closed.cancelled'];
const kindOptions  = ['all', 'youth', 'adult', 'transfer'];
```

State chip colors:

| state | color |
| --- | --- |
| `applied` | `warning` |
| `reviewing` | `primary` |
| `closed.approved` | `success` |
| `closed.denied` | `danger` |
| `closed.cancelled` | `medium` |

---

## 9. ApplicationEditModal (`application-edit.modal.ts`)

Smart modal component. Selector: `bk-application-edit-modal`. Wraps `ApplicationForm`.

### 9.1 Mode

Only `edit`. There is no `new` mode — applications are created by the public FormSection submission path (§1), not by this modal.

Buttons visible: `Save`, `Accept`, `Deny`, `Cancel`.

On open, the modal calls `applicationService.beginReview(app, reviewer)` once (if `state === 'applied'`).

### 9.2 Save flow

1. Validate via vest suite (`applicationValidationSuite`).
2. `Save` button: call `applicationService.update(...)` → keep modal open.
3. `Accept` button: confirmation alert → `applicationService.accept(...)` → dismiss with `{ accepted: true, personKey }`.
4. `Deny` button: `AlertController` prompt for `closeReason` (non-empty) → `applicationService.deny(...)` → dismiss.
5. `Cancel` button: dismiss with no changes (and no state transition — `beginReview` already ran on open).

### 9.3 Accept flow

```
Accept clicked
  └── Confirmation alert: "Antrag {firstName} {lastName} annehmen?"
        └── applicationService.accept(app)
              ├── personService.create(toPersonModel(app))
              ├── addressService.create(toAddressModel(app, person.bkey))
              ├── taskService.update(linkedTask)             // close task
              ├── applicationService.update(app)             // state=closed.approved, personKey, closedAt
              └── mailService.send('application.accepted', app)
        └── Toast: "Antrag genehmigt — {firstName} {lastName} wurde erstellt"
```

Accept creates **only** the person + address. If the approver wants a membership or a group invite, they trigger `add-membership` / `add-to-group` from the list afterwards (§9.4).

If `personService.create()` fails, the application stays in `reviewing`. If person creation succeeds but the subsequent application update fails, the person is **not** rolled back; the approver fixes the application from the admin overview (`aoc/application`, §11).

### 9.4 Follow-up actions

These are triggered from the list action menu (§8.2), not from the edit modal.

**`add-membership`** — opens `MembershipNewModal` (existing) with pre-filled defaults:

- `member` → `AvatarInfo` derived from `application.personKey` (person)
- `orgKey` → `appConfig.defaultOrgKey` (e.g. `'scs'` for the SCS app)
- `category` → result of `proposeMembershipCategory(app)` (see §5.3): `'junior'` (< 20), `'active'` (≥ 20 transfer), `'candidate'` (≥ 20 youth/adult)
- `dateOfEntry` → today (`DateFormat.storeDate`)

The approver confirms or edits the defaults before saving. No application state change.

**`add-to-group`** — opens a group select modal (reuse the existing group picker / `MultiSelectModal` filtered to groups). On confirm, calls `groupService.invite(group, personKey)` for each selected group. No application state change.

Both actions are no-ops with a warning toast if `application.personKey === ''`.

---

## 10. ApplicationForm (`application.form.ts`)

Dumb / presentational. Uses `ngx-vest-forms` + Angular template-driven forms.

### Inputs

```typescript
public readonly application = input.required<ApplicationModel>();
public readonly readonly = input<boolean>(false);                // true for terminal/closed.* states
public readonly i18n = input.required<ApplicationFormI18n>();
public readonly zipCities = input.required<SwissCity[]>();       // for zip/city autocomplete (reuse swisscities lib)
```

The form has a single rendering mode. When `readonly === true` (terminal state), all inputs are disabled. Although the form is also used by the public FormSection on the website, that integration is owned by FormsBuilder and is out of scope here — this `ApplicationForm` component is only consumed by the approver's `ApplicationEditModal`.

### Outputs

```typescript
public readonly applicationChange = output<ApplicationModel>();
public readonly validityChange = output<boolean>();
```

### Field layout

| Section | Field | Type | Mandatory | Notes |
| --- | --- | --- | --- | --- |
| Person | `firstName` | text | yes | |
| Person | `lastName` | text | yes | |
| Person | `gender` | radio (`male`, `female`) | yes | |
| Person | `dateOfBirth` | date | yes | `yyyymmdd`; uses `DateFormat.storeDate` |
| Person | `ssnId` | text | conditional | Shown only when `needsSsn(application)` returns true; validated by `ssnValidations` |
| Contact | `email` | email | conditional | **Adult / transfer:** mandatory. **Youth:** required only when `parentEmail` is empty (kid OR parent must cover the channel; both is allowed). Recipient for confirmation + decision emails. |
| Contact | `phone` | tel | conditional | Same conditional rule as `email`. E.164 preferred. |
| Address | `streetName` | text | yes | |
| Address | `streetNumber` | text | yes | |
| Address | `zipCode` | text | yes | 4-digit (CH); autocomplete via `zipCities` |
| Address | `city` | text | yes | autocomplete-linked to `zipCode` |
| Address | `countryCode` | dropdown | yes | default `CH` |
| Parent | `parentFirstName` | text | conditional | Shown + mandatory when `applicationAs === 'youth'` |
| Parent | `parentLastName` | text | conditional | Shown + mandatory when `applicationAs === 'youth'` |
| Parent | `parentEmail` | email | conditional | Shown for youth. Required when `email` is empty; otherwise optional. |
| Parent | `parentPhone` | tel | conditional | Shown for youth. Required when `phone` is empty; otherwise optional. |
| Application | `applicationAs` | dropdown (`youth`, `adult`, `transfer`) | yes | drives `needsSsn`, parent section visibility, and `add-membership` defaults |

Read-only badges (`state`, `submittedAt`, `reviewedAt`, `reviewer.name`, `closeReason`) are rendered above the form whenever the values are set on the model.

---

## 11. AocApplication Admin View (optional, follow-up)

Route component. Selector: `bk-aoc-application`. Route: `aoc/application` (admin-only, `isAdminGuard`).

Cards:

1. **Postfach** — `state === 'applied'`, sorted by `submittedAt` ascending; one-click `beginReview`.
2. **In Bearbeitung** — `state === 'reviewing'`; jump to `ApplicationEditModal`.
3. **Letzte Entscheidungen** — `state` starts with `closed.`, last 30 days, grouped by approver.
4. **Verwaiste Anträge** — `state ∈ {applied, reviewing}` without a linked task or with an unassigned task; offer "Task neu erstellen" action.
5. **Archiviert** — `isArchived === true`; restore or hard-delete (confirm twice).

---

## 12. Routes

Add to [apps/scs-app/src/app/app.routes.ts](apps/scs-app/src/app/app.routes.ts):

```typescript
// Approver list (privileged users)
{
  path: 'applications',
  canActivate: [isPrivilegedGuard],
  loadComponent: () => import('@bk2/application-feature').then(m => m.ApplicationList),
},

// Admin overview
{
  path: 'aoc/application',
  canActivate: [isAdminGuard],
  loadComponent: () => import('@bk2/application-feature').then(m => m.AocApplication),
},
```

The public submission page lives on the website project as a CMS page rendered by FormSection — it is not part of these routes. The FormSection's submit handler will end up calling `ApplicationService.create(...)`, but wiring that integration is owned by the FormsBuilder spec.

---

## 13. i18n Keys (`libs/subject/application/feature/src/i18n/de.json`)

```json
{
  "list": {
    "title": "Anträge",
    "empty": "Keine Anträge gefunden."
  },
  "edit": {
    "title": "Antrag bearbeiten",
    "save": "Speichern",
    "accept": "Annehmen",
    "deny": "Ablehnen",
    "save_conf": "Antrag aktualisiert.",
    "save_error": "Aktualisierung fehlgeschlagen.",
    "accept_confirm": "Antrag {{ firstName }} {{ lastName }} annehmen? Es wird eine Person erstellt.",
    "accept_conf": "Antrag genehmigt — {{ name }} wurde erstellt.",
    "accept_error": "Genehmigung fehlgeschlagen.",
    "deny_conf": "Antrag abgelehnt.",
    "deny_error": "Ablehnen fehlgeschlagen.",
    "deny_reason": "Grund der Ablehnung"
  },
  "delete": {
    "confirm": "Soll dieser Antrag wirklich gelöscht werden?",
    "conf": "Antrag gelöscht.",
    "error": "Löschen fehlgeschlagen."
  },
  "actions": {
    "add_membership": "Mitgliedschaft hinzufügen",
    "add_to_group": "Zu Gruppe einladen",
    "membership_added": "Mitgliedschaft hinzugefügt.",
    "group_invited": "Person zu Gruppe eingeladen.",
    "no_person": "Person noch nicht erstellt — Antrag zuerst annehmen."
  },
  "mail": {
    "confirmation_sent": "Bestätigung an Antragsteller/in versendet.",
    "decision_sent": "Entscheidung an Antragsteller/in versendet.",
    "send_failed": "E-Mail konnte nicht versendet werden."
  },
  "field": {
    "first_name": "Vorname",
    "last_name": "Nachname",
    "gender": "Geschlecht",
    "date_of_birth": "Geburtsdatum",
    "ssn": "AHV-Nummer",
    "email": "E-Mail",
    "phone": "Telefon",
    "street_name": "Strasse",
    "street_number": "Nr.",
    "zip_code": "PLZ",
    "city": "Ort",
    "country_code": "Land",
    "parent_first_name": "Vorname Elternteil",
    "parent_last_name": "Nachname Elternteil",
    "parent_email": "E-Mail Elternteil",
    "parent_phone": "Telefon Elternteil",
    "application_as": "Antrag als",
    "state": "Status",
    "submitted_at": "Eingegangen",
    "reviewed_at": "In Bearbeitung seit",
    "reviewer": "Bearbeiter",
    "close_reason": "Bemerkung"
  },
  "validation": {
    "email_required_either": "E-Mail ist erforderlich (entweder Antragsteller/in oder Elternteil).",
    "phone_required_either": "Telefon ist erforderlich (entweder Antragsteller/in oder Elternteil)."
  },
  "section": {
    "person": "Person",
    "contact": "Kontakt",
    "address": "Adresse",
    "parent": "Eltern (Pflicht für Jugendliche)",
    "application": "Antrag"
  },
  "kind_youth": "Jugendliche/r",
  "kind_adult": "Erwachsene/r",
  "kind_transfer": "Übertritt",
  "state_applied": "Eingegangen",
  "state_reviewing": "In Bearbeitung",
  "state_closed_approved": "Angenommen",
  "state_closed_denied": "Abgelehnt",
  "state_closed_cancelled": "Zurückgezogen",
  "cancel": "Abbrechen"
}
```

Top-level prefix `@application/` is registered via `PFX` in `data-access/src/lib/scope.ts`.

---

## 14. Utility Functions (`application.util.ts`)

```typescript
export function newApplication(tenantId: string): ApplicationModel;
// Returns a fresh ApplicationModel with countryCode='CH', state='applied'.

export function getApplicationIndex(app: ApplicationModel): string;
// Concatenates firstName, lastName, zipCode, city, applicationAs, state via addIndexElement.

export function needsSsn(app: ApplicationModel, today = new Date()): boolean;
// True when applicationAs === 'youth' OR getAgeAt(app.dateOfBirth, today) < 20.

export function toPersonModel(app: ApplicationModel, tenantId: string): PersonModel;
// See §5.2.

export function toAddressModel(app: ApplicationModel, personKey: string, tenantId: string): AddressModel;
// Maps streetName/streetNumber/zipCode/city/countryCode → AddressModel with parentKey='person.'+personKey.

export function matchesStateFilter(state: ApplicationState, filter: string): boolean;
// 'open' → state in {applied, reviewing}; 'closed' → state.startsWith('closed.'); 'all' → true; else exact match.

export function stateColor(state: ApplicationState): 'warning' | 'primary' | 'success' | 'danger' | 'medium';
```

Date arithmetic uses `convertDateFormatToString` / `convertDateFormat` / `DateFormat` from `@bk2/shared-util-core` per the project's hard rule — no custom date helpers.

---

## 15. Vest Validations (`application.validations.ts`)

```typescript
import { create, enforce, test, omitWhen } from 'vest';
import { needsSsn } from './application.util';
import { ssnValidations } from '@bk2/subject-person-util';

export const applicationValidationSuite = create((app: ApplicationModel, field?: string) => {
  test('firstName',     '@application/field.first_name',     () => enforce(app.firstName).isNotBlank());
  test('lastName',      '@application/field.last_name',      () => enforce(app.lastName).isNotBlank());
  test('gender',        '@application/field.gender',         () => enforce(app.gender).inside(['male', 'female']));
  test('dateOfBirth',   '@application/field.date_of_birth',  () => enforce(app.dateOfBirth).matches(/^\d{8}$/));
  test('streetName',    '@application/field.street_name',    () => enforce(app.streetName).isNotBlank());
  test('streetNumber',  '@application/field.street_number',  () => enforce(app.streetNumber).isNotBlank());
  test('zipCode',       '@application/field.zip_code',       () => enforce(app.zipCode).isNotBlank());
  test('city',          '@application/field.city',           () => enforce(app.city).isNotBlank());
  test('countryCode',   '@application/field.country_code',   () => enforce(app.countryCode).isNotBlank());
  test('applicationAs', '@application/field.application_as', () => enforce(app.applicationAs).inside(['youth', 'adult', 'transfer']));

  // SSN: only required for youth-aged applicants (see needsSsn).
  omitWhen(!needsSsn(app), () => {
    test('ssnId', '@application/field.ssn', () => enforce(app.ssnId).isNotBlank());
    ssnValidations('ssnId', app.ssnId, app.countryCode);
  });

  // Format checks — run only when the field is non-empty (always cheap).
  omitWhen(!app.email,       () => test('email',       '@application/field.email',        () => enforce(app.email).matches(EMAIL_RE)));
  omitWhen(!app.parentEmail, () => test('parentEmail', '@application/field.parent_email', () => enforce(app.parentEmail).matches(EMAIL_RE)));

  // Channel coverage:
  //   - Adult / transfer: kid must fill email + phone (no parent fields involved).
  //   - Youth: per channel, kid OR parent must fill it (both is OK).
  if (app.applicationAs !== 'youth') {
    test('email', '@application/field.email', () => enforce(app.email).isNotBlank());
    test('phone', '@application/field.phone', () => enforce(app.phone).isNotBlank());
  } else {
    test('parentFirstName', '@application/field.parent_first_name', () => enforce(app.parentFirstName).isNotBlank());
    test('parentLastName',  '@application/field.parent_last_name',  () => enforce(app.parentLastName).isNotBlank());

    // Per-channel "kid OR parent" rule. Error binds to the kid field by convention;
    // the form highlights both fields in the same row when this fails.
    test('email', '@application/validation.email_required_either', () => {
      enforce(!!app.email || !!app.parentEmail).isTruthy();
    });
    test('phone', '@application/validation.phone_required_either', () => {
      enforce(!!app.phone || !!app.parentPhone).isTruthy();
    });
  }
});
```

---

## 16. Firestore Security Rules

Add to [firestore.rules](firestore.rules):

```
match /applications/{appId} {
  allow read:   if isAuthenticated()
                 && belongsToTenant(resource)
                 && (isAdmin() || isApplicationApprover() || isOwnApplication(resource));
  allow create: if belongsToTenant(request.resource)
                 && request.resource.data.state == 'applied'
                 && request.resource.data.taskKey == ''
                 && request.resource.data.personKey == '';
  allow update: if (isAdmin() || isApplicationApprover())
                 && belongsToTenant(resource);
  allow delete: false;   // soft archive only
}
```

- `isApplicationApprover()` resolves the `application` responsibility and compares it to `request.auth.uid` (via the linked `UserModel.personKey`).
- `isOwnApplication(resource)` lets an authenticated applicant read their own submission once their user account exists (matched via `personKey`).
- `create` is allowed for anonymous users to support a public landing-page form. Initial-state validation prevents an anonymous client from bypassing review.

---

## 17. Activity / Audit

Activities logged by `ActivityService` with topic `'application'`:

| Verb | When |
| --- | --- |
| `create` | submission |
| `begin-review` | first edit by an approver |
| `update` | any field edit in `reviewing` |
| `accept` | terminal transition to `closed.approved` |
| `deny` | terminal transition to `closed.denied` |
| `cancel` | terminal transition to `closed.cancelled` |
| `delete` | soft archive |

Payload format: `${bkey}: ${lastName}/${firstName} (${applicationAs}) → ${state}`.

---

## 18. Open Questions

| # | Question | Owner | Status |
| --- | --- | --- | --- |
| 1 | Confirm `ApplicationModel` schema additions to `@bk2/shared-models` (workflow fields: `submittedAt`, `reviewedAt`, `closedAt`, `reviewer`, `closeReason`, `personKey`, `taskKey`). | Bruno | **Approved 2026-05-27** |
| 2 | Single generic `application` responsibility, or split per kind? | Bruno | **Decided: generic for now** |
| 3 | Public submission page implementation. | Bruno | **Decided: FormSection / FormBuilder later — out of scope here** |
| 4 | Automatic membership creation at accept time? | Bruno | **Decided: NO. Discrete `add-membership` action with proposed category — see §5.3** |
| 5 | Where does the applicant's email address come from? | Bruno | **Decided: `email: string` (and `phone: string`) added to `ApplicationModel`; parent contact (`parentFirstName`, `parentLastName`, `parentEmail`, `parentPhone`) added for youth applications. See §3.5 and §5.4.** |
| 6 | Guard for `ApplicationList`. | Bruno | **Decided: `isPrivilegedGuard`** |
| 7 | Rollback semantics. | Bruno | **Decided: no rollback. If a step fails, partial writes stay; application stays in `reviewing` for manual cleanup.** |
| 8 | Email template ids in Mailgun (`application.confirmation` / `application.accepted` / `application.denied`). | Bruno | **Confirmed** |
| 9 | Default-org resolution at `add-membership` time. | Bruno | **Decided: `AppStore.defaultOrg()`** |
| 10 | `addressChannel` ids — verified against [`address.util.ts`](libs/subject/address/util/src/lib/address.util.ts): `'email'`, `'phone'`, `'postal'`. `addressUsage` uses `'home'` and `'custom'` with `addressUsageLabel = 'Eltern'`. | Bruno | **Resolved** |
| 11 | Mail recipient resolution. | Bruno | **Decided: TO = favorite email, CC = cc-addresses (no BCC). See §6.2.** |
| 12 | Parent gender default. | Bruno | **Confirmed: `'female'`** |

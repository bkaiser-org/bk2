
# FormsBuilder — Technical Specification

**Status:** Draft v2
**Author:** —
**Last updated:** 2026-05-27 (rev 2: added phone/iban/avatar/time/password/images field types; renamed FormDefinition → FormDefinitionModel; introduced FormMapping; immutable formKey; resolved open questions)

---

## 1. Overview

FormsBuilder is a CMS feature that lets editors design forms visually and embed them on pages via a new CMS section called **FormSection**. Submissions are persisted to a configured collection (or POSTed to an external URL such as Google Forms), and can optionally trigger an approval-style task and email notifications. Spam protection, audit logging, and CSV/PDF export are built in.

This specification covers v1. Multi-page / multi-step forms, third-party integrations beyond URL upload, and server-side e-signature flows are explicitly out of scope.

### 1.1 Scope summary

| In scope | Out of scope |
|---|---|
| Visual form definition editor with field-type library | Multi-page / multi-step forms |
| FormSection CMS section for rendering | Generic third-party integrations |
| Submission storage in collection **or** URL upload | Server-side e-sign (uses existing client-side DeepSign) |
| Optional approval task + email notification | Email sending implementation (uses existing Mailgun CF) |
| Spam protection (honeypot, time-based, JS, rate-limit, optional CAPTCHA) | PDF generation implementation (uses existing CF) |
| CSV and PDF export of submissions | |
| Audit logging into system activities | |

---

## 2. Glossary

- **Form definition** — the persisted schema of a form (fields, validation, layout). No submission data. Modelled as `FormDefinitionModel`.
- **Form rendering** — the runtime UI generated from a form definition by FormSection.
- **Submission** — a single set of values entered by an end user.
- **Collection** — a Firestore collection where submissions are stored as documents.
- **FormMapping** — a registry entry that whitelists a Firestore collection as a submission target, declares its model type, optional field whitelist, and optional default values. See §5.1.
- **Responsibility** — an existing concept that maps a key to a user / group who can be assigned approval tasks.
- **System activities** — the existing platform-wide audit log.
- **`BkModel` / `NamedModel`** — existing base interfaces in the platform that supply `bkey`, `tenants`, `isArchived` and `name` respectively.

---

## 3. Field type library

Each field type is registered with: type id, display label, icon, default config, validator factory, renderer component, and preview component.

| # | Type id | Label | Default validators | Notes |
|---|---|---|---|---|
| 1 | `text` | Text | required?, min/max length, regex | Single-line; multi-line variant via `multiline: true` |
| 2 | `email` | Email | required?, RFC 5322 pattern | Uses Angular `Validators.email` |
| 3 | `number` | Number | required?, min, max, step, integer? | HTML5 `inputmode="numeric"` |
| 4 | `phone` | Phone | required?, E.164 pattern, region | International phone input; stored as E.164 string. Validation via `libphonenumber-js`. Default region from tenant config. |
| 5 | `iban` | IBAN | required?, IBAN checksum (ISO 13616) | Bank account number. Mod-97 checksum validated; spaces stripped on save. Country whitelist optional. |
| 6 | `password` | Password | required?, min length, complexity rules | Masked input. **Never stored in plaintext** — see §3.3. |
| 7 | `dropdown` | Dropdown | required? | Options: `[{ label, value }]`, optional grouping |
| 8 | `checkbox` | Checkbox | required? (= must be checked) | Single boolean **or** group with multi-select |
| 9 | `radio` | Radio group | required? | Options as for dropdown |
| 10 | `file` | File upload | required?, accept (mime), maxSizeMb, maxCount | Upload target: storage bucket; see §9 for encryption |
| 11 | `images` | Images | required?, maxCount | Array of imgix URLs. Rendered as thumbnail grid in submission view and PDF export. |
| 12 | `date` | Date | required?, min, max | Calendar-only, no time component. Stored as `YYYYMMDD` string (8-digit). Uses **shared/util** date conversions for display. |
| 13 | `time` | Time | required?, min, max | Time-of-day picker, no date component. Stored as `HH:mm` (24-hour). |
| 14 | `signature` | Signature | required? | Client-side capture via existing **DeepSign** integration; stored as PNG/SVG + signed payload |
| 15 | `rating` | Rating | required?, scale (default 5), allowHalf | Star UI |
| 16 | `avatar` | Avatar | required?, avatarType | **Auth-only.** See §3.4. Select button opens `MultiAvatarModal` filtered by configured `avatarType` (`person`, `org`, `resource`). The full `AvatarModel` is stored in the submission. |

### 3.1 Field-type library UI

The library is a panel on the left of the form editor. Each field type renders as a card:

```
┌─────────────────────────┐
│  [icon]   Text          │
│  Single-line input      │
│  ⓘ More info            │
└─────────────────────────┘
```

- **Drag and drop** a card onto the form canvas to add a field.
- Each card has a **More info** link → `/docs/forms/field-types/{type}` (in-app help).
- Cards are searchable and filterable.

### 3.2 Common field properties

Every field, regardless of type, has:

```ts
interface FieldBase {
  id: string;              // stable uuid, never reused
  key: string;             // becomes the collection field name; snake_case enforced
  label: string;
  helpText?: string;
  placeholder?: string;
  required: boolean;
  visibleIf?: ConditionExpr;   // simple visibility expression (planned hook, v1 leaves blank)
  width: 'full' | 'half' | 'third';
  order: number;
}
```

Type-specific properties extend `FieldBase`.

### 3.3 Password field handling

The `password` field type requires special handling because submission data is normally readable by the responsible user and stored as-is in the target collection — which is unacceptable for credentials.

Rules:

- The value is **hashed client-side** before submission using Argon2id (via WebAssembly) or bcrypt. The plaintext never reaches the server.
- The submission stores only the hash + the algorithm parameters. There is no way to recover the plaintext.
- The hash is **not exported in CSV or PDF**. The export shows `***`.
- Approval-task and email-notification payloads similarly redact the field.
- The field type is intended for cases like "set a password for your account during signup" — where the consuming system needs to verify the hash later. It is **not** intended for storing third-party credentials; the field-type help link warns about this.

If `encryptFileUpload` is also enabled on the section, the password field is independent of that mechanism and uses its own hashing pipeline.

### 3.4 Avatar field

The `avatar` field type is available **only inside forms rendered to authenticated users**. If an unauthenticated user lands on a FormSection whose definition contains an `avatar` field, the field is hidden and (if required) the form blocks submission with a "please sign in" prompt.

Type-specific config:

```ts
interface AvatarFieldConfig extends FieldBase {
  type: 'avatar';
  avatarType: 'person' | 'org' | 'resource';
  multi: boolean;                    // allow multiple selections, default false
}
```

UI behaviour:

1. The field renders a **Select** button (and any already-chosen avatars as chips).
2. Clicking Select opens the existing `MultiAvatarModal`, pre-filtered by `avatarType`.
3. On confirm, the chosen `AvatarModel`(s) are displayed inline in the form (avatar image + name).
4. On submit, the **full `AvatarModel` data** is stored in the submission — not just an id reference. This is intentional so the submission is self-contained and survives if the referenced avatar is later deleted or renamed.

Validation:

- If `required` and `multi: false`, exactly one avatar must be selected.
- If `required` and `multi: true`, at least one must be selected.

---

## 4. Form-definition management

A list view shows all form definitions belonging to the tenant. **Only definitions are listed — never renderings, never submission data.**

Per-row actions:

- **Open** — opens the editor
- **Rename** — inline rename of the form `name` only. `formKey` is auto-generated on creation and **immutable** thereafter (see §4.2).
- **Duplicate** — creates a new definition with `(copy)` suffix in `name` and a freshly generated `formKey`
- **Archive** — sets `isArchived = true`. Archived forms are hidden from the default list view but remain queryable and their submissions stay accessible. FormSections referencing an archived form continue to render but show a warning to editors.
- **Delete** — hard delete is *not* offered from the UI in v1. Use Archive instead. (Out-of-band tenant cleanup is the only path to true deletion.)

### 4.1 Persistence

Form definitions live in a dedicated Firestore collection `formDefinitions`:

```ts
interface FormDefinitionModel extends BkModel, NamedModel {
  // from BkModel
  bkey: string;                // business key, stable identifier within tenant
  tenants: string[];           // tenants this definition belongs to (multi-tenant capable)
  isArchived: boolean;         // soft-archive flag

  // from NamedModel
  name: string;                // human-readable name, shown in the list view and editor header

  // form-specific
  formKey: string;             // auto-generated slug, immutable; used by FormSection refs
  description?: string;
  target: SubmissionTarget;    // see §6
  fields: Field[];
  version: number;             // bumped on save
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}
```

`FormDefinitionModel` implements both `BkModel` (giving it `bkey`, `tenants`, `isArchived`) and `NamedModel` (giving it `name`), consistent with other domain models in the platform.

### 4.2 `formKey` lifecycle

- **Auto-generated** on creation from the initial `name` (slugified, lowercased, hyphenated) with a short random suffix to guarantee uniqueness within the tenant — e.g. `contact-form-x7q2`.
- **Immutable** after creation. Renaming the form changes `name` only; `formKey` stays fixed forever.
- This guarantees FormSection references never break and audit-log entries remain comparable across the form's lifetime.
- If a user really needs a "new key", the path is **Duplicate** (which creates a new definition with a new `formKey`) followed by archiving the old one.

---

## 5. Creating a form — initial flow

When the user clicks **New form**, a wizard opens.

### Step 1 — Target

Ask first:

> **Where should submissions go?**
> ○ Into a Firestore collection (recommended)
> ○ POST to an external URL (e.g. Google Forms)

- If **Firestore collection** → the user picks from a **predefined, whitelisted set of submission-ready collections** (see §5.1). The wizard then introspects the corresponding model and generates a starter form: one field per included column, with the field type inferred from the column type (string → text, number → number, date → date, boolean → checkbox, enum → dropdown, email → email, phone → phone, iban → iban, etc.). Required model fields become required form fields. The user can edit the starter form freely afterwards.
- If **URL** → the user provides the target URL. No starter fields are generated; the form starts empty.

In v1, the only submission-ready collection is **`applications`** (mapped to `ApplicationModel`). New collections are added by registering a new `FormMapping` (§5.1).

### Step 2 — Basic metadata

`name`, description. `formKey` is auto-generated and shown read-only (see §4.2).

### Step 3 — Open editor

Drops the user into the form editor with the starter form (or empty canvas) loaded.

### 5.1 FormMapping — registering submission-ready collections

The list of collections that forms can write to is **not** open-ended. It is governed by a registry of `FormMapping` entries.

**Why a separate `FormMapping` (rather than per-model config or FormBuilder config):**

I considered three options:

| Option | Pros | Cons |
|---|---|---|
| Add config on each Model (`ApplicationModel.formConfig`) | Co-located with the model; one source of truth per model | Forces a 1:1 model↔form relationship; awkward when one form should write to multiple models, or one model should accept multiple distinct forms (e.g. "short application" vs. "full application") |
| Hardcode in FormBuilder | Simple, no new abstraction | Adding a new submission-ready collection requires a FormBuilder code change; doesn't compose well |
| **Separate `FormMapping` registry** (recommended) | Decouples form layer from model layer; supports many-to-many (one mapping per *use case*); each mapping carries its own field whitelist and defaults; future-proof | One more concept to learn |

**Recommendation: introduce `FormMapping`.** It's the only option that cleanly supports:

- Multiple forms per model (e.g. `application-short`, `application-full`, both writing to `applications`).
- A single form writing to more than one collection (via a composite mapping — out of scope for v1 but the shape doesn't preclude it).
- A field whitelist per mapping (so a "public contact form" exposes a tiny subset of `ApplicationModel`).
- **Default values** that are set automatically on submission and never asked from the user (e.g. `status: 'new'`, `source: 'website'`, `tenant: <current>`).

```ts
interface FormMapping {
  mappingKey: string;             // stable identifier, e.g. 'applications.default'
  label: string;                  // shown in the wizard's collection picker
  modelType: string;              // e.g. 'ApplicationModel' — drives starter-form generation
  collectionName: string;         // e.g. 'applications'
  includedFields?: string[];      // whitelist of model fields offered in the starter form; omitted = all non-system fields
  defaults?: Record<string, unknown>; // values set on every submission, not asked from the user
}
```

**v1 registry contents:**

```ts
const FORM_MAPPINGS: FormMapping[] = [
  {
    mappingKey: 'applications.default',
    label: 'Applications',
    modelType: 'ApplicationModel',
    collectionName: 'applications',
    // includedFields omitted = all non-system fields offered
    defaults: { status: 'new', source: 'form' },
  },
];
```

New mappings are added via code (a registration call at app bootstrap) — there's no UI to create them, by design. This keeps the set of writeable collections under engineering control.

The wizard's collection picker shows mapping `label`s. The chosen `mappingKey` is what's stored on the `FormDefinitionModel` (via `SubmissionTarget`, §6).

---

## 6. SubmissionTarget

```ts
type SubmissionTarget =
  | {
      kind: 'collection';
      mappingKey: string;          // references a FormMapping (§5.1)
      modelType: string;           // denormalized from the mapping for fast lookup & audit clarity
      collectionName: string;      // denormalized from the mapping
    }
  | { kind: 'url'; url: string };
```

`modelType` and `collectionName` are denormalized onto the target so submission processing doesn't need to re-resolve the mapping on every write, and so the audit log records exactly which model/collection a submission landed in even if the mapping is later changed.

If the underlying `FormMapping` is updated (e.g. `includedFields` extended), existing form definitions keep working with their captured target; only newly created or explicitly re-synced forms pick up the change.

Only one variant is set. The wizard guarantees this.

---

## 7. FormSection (CMS section)

A new section type **FormSection** is added to the CMS, alongside existing sections (TextSection, ImageSection, etc.). Editors drop it onto a page and configure it.

### 7.1 Section config

```ts
interface FormSectionConfig {
  formKey: string;                 // references a FormDefinitionModel
  // exactly one of the two below may be set; if both omitted, defaults to the form definition's target
  mappingKey?: string;             // references a FormMapping (§5.1); overrides definition target
  url?: string;                    // overrides definition target with a URL POST

  responsibilityKey?: string;      // optional; triggers approval-style task on submit
  emailAddresses?: string[];       // optional; recipients of notification email

  showCaptcha: boolean;            // default false
  encryptFileUpload: boolean;      // default false
  rateLimit: {
    limit: number;                 // default 10
    periodMinutes: number;         // default 5
  };
}
```

Notes:

- Section config overrides the definition's target if set. This allows the same form to be embedded twice with different targets (e.g. a staging mapping vs. a production mapping).
- When `mappingKey` is used, the section resolves it at render-time and snapshots the resulting `{ modelType, collectionName }` into the submission payload for audit clarity.
- `responsibilityKey` is optional and independent from `emailAddresses` — either, both, or neither may be set.

### 7.2 Rendering

FormSection fetches the form definition by `formKey`, renders the fields using Angular Reactive Forms (`FormGroup` + `FormControl` per field), and handles submission.

**Angular Forms is used throughout** (not vest). Validators are composed from the per-field validator definitions into Angular's `ValidatorFn[]`.

```ts
// Sketch
const group = new FormGroup(
  Object.fromEntries(
    definition.fields.map(f => [f.key, new FormControl(defaultFor(f), validatorsFor(f))])
  )
);
```

---

## 8. Submission processing

When the form is submitted client-side, the request hits a Cloud Function `submitForm` with payload:

```ts
{
  formKey: string,
  sectionConfigRef: string,        // page id + section id
  values: Record<string, unknown>,
  meta: {
    pageLoadedAt: string,          // ISO timestamp from the client
    submittedAt: string,
    honeypotWebsite: string,       // expected empty
    jsToken: string,               // injected by client JS at page load
    userAgentFingerprint: string,  // hashed
  }
}
```

The function performs the following steps **in order**. Any step that flags the submission as spam **still saves the submission** (see §10) but skips notifications and tasks.

1. **Resolve config** — load the form definition, section config, and (if collection target) the `FormMapping` from the registry.
2. **Rate limit** — see §10.4. On exceeded → respond `429 Too Many Requests`. **Not stored.**
3. **Spam checks** — honeypot field, time delta, JS token, optional CAPTCHA (§10). On fail → mark `isSpam = true`.
4. **Validate** — server-side validation re-runs the same rules the client uses.
5. **Persist** —
   - If `target.kind === 'collection'`:
     - Build the record by merging `mapping.defaults` (lowest precedence) with the submitted `values` (highest precedence). The user can never override a default by sending the same key — defaults always win, to prevent submission-tampering attempts to set e.g. `status: 'approved'`.
     - Write to the Firestore collection `target.collectionName`. Each form field becomes a document field, keyed by `field.key`.
     - The resulting document conforms to `target.modelType` (e.g. `ApplicationModel`).
     - Files are stored via the standard file pipeline (see §9). `password` fields are stored as hashes only (see §3.3). `avatar` fields store the full `AvatarModel`.
   - If `target.kind === 'url'`: POST the values to `url` as `application/x-www-form-urlencoded` (Google Forms style) or `application/json` depending on URL configuration. `defaults` from the mapping do not apply to URL targets.
6. **Audit log** — write a `system_activities` entry (§11).
7. **Side effects** — only if `isSpam === false`:
   - If `responsibilityKey` is set → open an approval-style task (§12).
   - If `emailAddresses` is non-empty → trigger the existing Mailgun CF (§13).
8. **Respond** — `200 OK` with `{ submissionId }` so the client can show a confirmation.

---

## 9. File upload handling and optional encryption

### 9.1 Standard upload

Files referenced by `file` fields are uploaded to the existing storage bucket using the platform's file upload mechanism. The submission record stores file metadata (id, name, mime, size, url).

### 9.2 Encrypted uploads

If `encryptFileUpload === true`:

- Files are **encrypted client-side** before upload using AES-256-GCM with a per-form symmetric key.
- The encrypted blob is what reaches the bucket. The bucket itself never sees plaintext.
- The submission record stores ciphertext metadata only (encrypted name, IV, auth tag, ciphertext url).

**Password / key handling is explicitly out of band.** The platform does *not* store the encryption password. The intended workflow:

1. When `encryptFileUpload` is first enabled on a section, the editor is shown a generated password **once** and required to confirm they have stored it externally (e.g. password manager). The system stores only a salted hash of it (for round-trip verification, not decryption).
2. End users uploading files derive the encryption key from the same password via PBKDF2 (the password is transmitted to the user out of band — typically the form is behind an auth wall or the password is shared via a separate channel).
3. To decrypt and view files later, the responsible person re-enters the password into a dedicated decrypt view. The key never leaves the browser.

This means: **losing the password means losing access to the files.** That trade-off is intentional and must be surfaced in the UI when the option is enabled.

---

## 10. Spam protection

Four mechanisms are always active. A fifth (CAPTCHA) is optional per section.

### 10.1 HTML honeypot field

A hidden field is rendered inside every form:

```html
<!-- Honeypot field -->
<div style="position: absolute; left: -9999px;" aria-hidden="true">
  <label for="website">Leave this field empty</label>
  <input type="text" name="website" id="website" tabindex="-1" autocomplete="off">
</div>
```

If `values.website` (or whatever the honeypot key is — the key is randomized per form definition to make selectors harder to learn) contains anything, mark as spam.

### 10.2 Time-based honeypot

The page records `pageLoadedAt` on mount; the server compares `submittedAt - pageLoadedAt`. If the delta is less than **1500 ms**, mark as spam.

The threshold is configurable per environment. Both client timestamps are sanity-checked against the server clock to detect tampering (large skews → mark as spam too).

### 10.3 JavaScript token honeypot

On page load, client JS fetches a short-lived signed token from `/api/forms/token?formKey=…` and injects it into a hidden field `_jsToken`. The server verifies the token (HMAC, 30-minute TTL, single-use). Bots that don't execute JS won't have a valid token.

### 10.4 Rate limit

Fixed-window counter per `(ipAddress, userAgentFingerprintHash)` stored in Firestore (see §17.2). The fingerprint is a SHA-256 of `userAgent + acceptLanguage + acceptEncoding`, hashed to avoid storing PII directly.

The counter document key is `rateLimit/{ipHash}_{uaHash}_{windowStart}`, with an atomic `FieldValue.increment(1)` on each request and a TTL that expires the document after the window closes. This is sufficient for the per-section limits configured in §7.1 and avoids introducing Redis.

Defaults (from section config):
- `limit: 10` requests
- `periodMinutes: 5`

On exceeded, the server returns:

```
HTTP/1.1 429 Too Many Requests
Retry-After: <seconds>
```

The submission is **not** stored. This is the one spam-protection mechanism that drops requests outright, because it protects the backend from volumetric abuse — there's no value in persisting the 11th submission per minute from the same source.

### 10.5 Optional CAPTCHA

Enabled per section via `showCaptcha: true`.

**Recommendation: reCAPTCHA Enterprise via Firebase App Check.**

- The platform already has Firebase, so adding App Check is incremental rather than a new dependency.
- reCAPTCHA Enterprise gives 10,000 assessments per month at no cost, has more security features and fraud signals than reCAPTCHA v3, and is the recommended option for new integrations.
- App Check uses score-based site keys, which makes it invisible to users — the reCAPTCHA Enterprise provider will not require users to solve a challenge at any time.
- Integration:

  ```ts
  import { initializeApp } from 'firebase/app';
  import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';

  initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(SITE_KEY),
    isTokenAutoRefreshEnabled: true,
  });
  ```

- On the server, the App Check token is verified before the submission is accepted. If the score is below the configured threshold, mark as spam.

**Open-source alternatives** if Firebase reCAPTCHA Enterprise is not desired (e.g. for stricter EU data residency or to avoid Google dependencies):

| Option | Mechanism | Notes |
|---|---|---|
| **ALTCHA** | Proof-of-work, self-hosted | GDPR-friendly, no cookies, Angular widget available, free + paid tiers |
| **Cap** | SHA-256 proof-of-work, self-hosted | Lightweight, modern, open-source |
| **Friendly Captcha** | Invisible proof-of-work | EU-based, paid SaaS with self-host option |
| **hCaptcha** | Image challenge | Privacy-focused, free tier |
| **Cloudflare Turnstile** | Browser challenges | Free, but tied to Cloudflare and known for false positives on privacy browsers |

**Decision for v1:** ship with reCAPTCHA Enterprise via App Check as the default. The CAPTCHA provider is abstracted behind a `CaptchaVerifier` interface so an open-source provider can be swapped in later without touching submission code:

```ts
interface CaptchaVerifier {
  verify(token: string, context: VerifyContext): Promise<{ ok: boolean; score?: number }>;
}
```

### 10.6 Handling of spam-flagged submissions

When any of the checks 10.1–10.3 or 10.5 trigger:

- `isSpam = true` is stored alongside the submission.
- Submission is written to the target collection as normal, but with the spam flag.
- **No** approval task is opened.
- **No** notification email is sent.
- The client receives a normal `200 OK` response so the bot cannot distinguish acceptance from silent rejection.
- A separate `system_activities` audit entry records *which* checks failed.

This design (store, don't drop, except for rate-limit) lets administrators review false positives and tune thresholds.

---

## 11. Audit log

Every submission produces an entry in the existing `system_activities` log:

```ts
{
  type: 'form.submission',
  formKey: string,
  submissionId: string,
  collectionName?: string,
  targetUrl?: string,
  clientIp: string,
  userAgentFingerprint: string,    // hashed
  isSpam: boolean,
  spamReasons?: string[],          // e.g. ['honeypot', 'too_fast']
  durationMs: number,              // submittedAt - pageLoadedAt
  timestamp: Date,
}
```

Rate-limit rejections produce a separate entry with `type: 'form.submission.rate_limited'` (no submission id).

---

## 12. Approval-style task workflow

When `responsibilityKey` is set on the section, a successful (non-spam) submission opens a **task** assigned to the responsible user/group resolved from the key.

### 12.1 Generic design

Rather than coupling forms to a specific task implementation, the spec proposes a generic **ApprovalWorkflow** hook that other features can also use later:

```ts
interface ApprovalWorkflow {
  startApproval(input: {
    sourceType: 'form.submission' | string;   // open extension point
    sourceId: string;
    responsibilityKey: string;
    title: string;
    payload: Record<string, unknown>;          // shown to the approver
    actions?: ApprovalAction[];                // defaults to approve/reject
  }): Promise<{ taskId: string }>;
}
```

For form submissions:

- `sourceType: 'form.submission'`
- `title`: `"New submission: {formTitle}"`
- `payload`: submitted values (with files as links, signature thumbnails inline)
- Default `actions`: `Approve` / `Reject` / `Request changes` (the third is a no-op placeholder for v1 — it just adds a comment and closes the task)

The approval result is written back onto the submission record as `approvalStatus` and `approvedBy` / `approvedAt`, so downstream queries can filter on it.

This generic shape means a future feature (e.g. document publishing) can call `startApproval` with its own `sourceType` and reuse the same task UI and notification machinery.

### 12.2 Task UI

Existing task list / inbox UI is reused. No new task UI is built for v1; tasks just need a renderer for the `form.submission` source type that displays the payload as a key-value table.

---

## 13. Email notification

If `emailAddresses` is non-empty, the existing **Mailgun CF** is invoked with:

- Recipients: `emailAddresses`
- Subject: `"New submission: {formTitle}"`
- Body: a templated summary listing each field's label and value, plus links to any files and a deep link to the submission record in the CMS.

No new email infrastructure is needed.

---

## 14. Export

### 14.1 CSV

From the submission list view of a form definition (or directly from the collection), a **Download CSV** action streams a CSV:

- Header row: field labels (with `key` in parentheses for disambiguation)
- One row per submission
- Files: rendered as URLs
- Signatures: rendered as URLs to the captured image
- Dates: formatted via **shared/util** date conversions (configurable locale)
- Spam-flagged rows: included by default with an `is_spam` column; toggle to exclude

### 14.2 PDF

Two flavours:

1. **Submission PDF** — a single submission rendered as PDF, using the existing **PDF generation CF with a template**. The template is a configurable per-form template (defaults to a generic key-value table). If the form definition is mapped to a *PDF form template* (an interactive PDF with named fields), the CF fills the PDF form fields by `field.key` match. This gives a "PDF forms"-style output when the template supports it.
2. **Batch PDF** — multiple submissions concatenated into a single PDF, one per page block. Uses the same per-submission rendering under the hood.

PDF generation is *not* reimplemented — it delegates entirely to the existing CF.

---

## 15. Shared / existing functionality used

- **shared/util** — date conversions (ISO ↔ display, locale-aware formatting), string utilities for `formKey` slugging, fingerprint hashing helpers.
- **Existing PDF CF** — submission and batch PDF rendering, including template-based form filling.
- **Existing Mailgun CF** — notification email sending.
- **Existing DeepSign integration** — client-side signature capture for the `signature` field type.
- **Existing task / inbox UI** — rendering approval tasks created by the workflow.
- **Existing storage bucket + file upload pipeline** — file fields.
- **Existing `system_activities` log** — audit entries.

No duplicate implementations of any of the above.

---

## 16. Out of scope (v1)

- **Multi-page / multi-step forms.** Planned for a later release. The data model already accommodates it via field `order` and a future `pageIndex`, but the editor and renderer treat all fields as a single page in v1.
- **Generic third-party integrations** (Zapier, Salesforce, etc.). Use the URL target as an escape hatch.
- **Inbound email parsing** or other non-HTTP submission channels.
- **Conditional logic editor** for `visibleIf` — the data structure exists but no UI ships in v1.
- **A/B testing or analytics** on form completion rates.

---

## 17. Resolved decisions

1. **CAPTCHA provider** — ✅ reCAPTCHA Enterprise via Firebase App Check, exposed behind the `CaptchaVerifier` interface so an open-source provider can be swapped in later.
2. **Rate-limit storage** — ✅ Firestore counter. The project already runs on Firestore; the fixed-window counter pattern (one document per `(ipHash, uaFingerprint, windowStart)` key with a `count` field, incremented atomically) is sufficient for the per-section limits in §7.1 and avoids introducing Redis as a new dependency.
3. **Encrypted file upload key derivation** — ✅ Use PBKDF2; exact parameters (iteration count, salt strategy) to be confirmed with security review before implementing §9.2.
4. **`formKey` lifecycle** — ✅ Auto-generated on creation and immutable thereafter. Renaming the form changes `name` only. To get a new key, duplicate the form. (Reflected in §4.2.)
5. **Archive vs. delete** — ✅ No hard delete from the UI. `isArchived` flag (from `BkModel`) hides forms from default views; submissions remain accessible indefinitely.

---

## 18. Implementation phasing (suggested)

| Phase | Scope |
|---|---|
| 1 | Field-type library, definition CRUD, editor, FormSection rendering, collection target, Angular Forms wiring |
| 2 | URL target, submission CF, audit log, CSV export |
| 3 | Spam protection (honeypot, time-based, JS token, rate limit) |
| 4 | Optional CAPTCHA, encrypted file upload |
| 5 | Approval workflow + email notifications |
| 6 | PDF export (single + batch), PDF-form template fill |

Each phase produces a shippable increment.

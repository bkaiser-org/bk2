# spec-vcard-export.md

**Module:** Contacts / Persons / Organizations
**Status:** Draft
**Target import:** Apple Contacts (macOS / iOS / iCloud)
**Related:** `PersonModel`, `OrgModel`, `AddressModel`, `PersonalRelModel`, `WorkRel`

---

## 1. Goal

Provide a "Download as vCard" capability that produces a `.vcf` file importable into
Apple Contacts. The **scope** of the export and the **entry point** depend on the
caller's role:

| Tier | Role          | Targets                       | Scope                                                                 | Entry point                                  | Asks what to export |
|------|---------------|-------------------------------|-----------------------------------------------------------------------|----------------------------------------------|---------------------|
| 1    | `registered`  | exactly one person **or** org | favorite phone + favorite email + favorite postal only                | action on the list item                      | no (fixed scope)    |
| 2    | `privileged`  | exactly one person **or** org | full address info (all usages/channels) + `PersonalRel` + `WorkRel`   | action on the list item                      | yes (data-driven)   |
| 3    | `memberAdmin` | the current multi-selection   | same full scope as tier 2, applied per record                         | function in the context menu (selection mode)| yes (data-driven)   |

Roles are evaluated for the **active tenant**. A user with a higher role also has the
lower entry points available (a `memberAdmin` still sees the per-item action).

---

## 2. Target format: vCard 3.0 (RFC 2426)

vCard **3.0** is the only version that imports reliably across Apple Contacts on macOS,
iOS, and iCloud.com. iCloud rejects 4.0 outright and is strict about non-standard
properties and oversized photos, so the generator MUST:

- emit `VERSION:3.0` and **UTF-8** content;
- use `CRLF` (`\r\n`) line endings;
- fold lines longer than 75 octets (continuation line begins with a single space);
- escape `\` `,` `;` and newlines in property *values* (`\\`, `\,`, `\;`, `\n`);
- keep embedded photos small (downscale to ≤ ~256 px / a few tens of KB) or omit them;
- use `X-AB*` properties for what 3.0 cannot express natively (relationships, custom
  labels). These are Apple-origin but **not Apple-exclusive** — Google Contacts speaks
  the same dialect (§2.1).

For a multi-record export (tier 3) the file is the concatenation of independent
`BEGIN:VCARD … END:VCARD` blocks, all at `VERSION:3.0`, in a single `.vcf`.

### 2.1 Portability beyond Apple Contacts

The chosen encoding is more portable than "Apple-proprietary" suggests, because the
`X-AB*` extensions originate with Apple but are also produced and consumed by Google.

| Target                              | Result                                                                                          |
|-------------------------------------|-------------------------------------------------------------------------------------------------|
| Apple Contacts (macOS/iOS/iCloud)   | Full fidelity — the design target.                                                              |
| **Google Contacts** (app & Gmail)   | Core fields import cleanly. `X-ABRELATEDNAMES` maps to Google's "Related people"; item-grouped `X-ABLabel` custom labels are honoured — Google emits the **same** syntax on its own export, so the card round-trips. |
| Stock **AOSP** Contacts / de-Googled apps (e.g. Fossify) | Standard values (phone/email/address) import, but `itemN.X-ABLabel` custom labels are not parsed — they fall back to a generic/"Custom" label or are dropped. Data is preserved; only the label cosmetics degrade. |
| Outlook / Thunderbird / CRMs        | Standard 3.0 fields import; `X-AB*` extensions are silently ignored.                             |

Apple-only properties and their behaviour elsewhere:

- `X-ABShowAs:COMPANY` (org card, §3.2) — ignored by non-Apple clients; an org then
  imports as an ordinary contact carrying the org name. Functionally fine.
- `X-ABLabel` predefined tokens like `_$!<Spouse>!$_` (§3.5) — Apple renders the
  localized label; other clients show the raw token or a custom label. Prefer plain
  custom labels when Apple fidelity is not required.

**Takeaway:** the `.vcf` is genuinely cross-platform for all *values*; only some
*labels* soften on non-Google Android stacks. No separate export profile per platform
is needed. If broad non-Apple fidelity ever becomes a priority, the alternative is a
vCard 4.0 profile using native `RELATED` and `KIND:org` — but that breaks iCloud import
(§2) and is therefore out of scope here.

---

## 3. Model → vCard mapping

Assumes addresses are modelled as a list of channel entries, each with a
`channelType`, a `usageType` (the "usage"), a `value`, and a `favorite` flag. Adjust
field names to the actual `AddressModel`.

```ts
type ChannelType = 'phone' | 'email' | 'postal' | 'web';
type UsageType   = 'home' | 'work' | 'private' | 'mobile' | 'fax' | 'other';

interface AddressModel {
  channelType: ChannelType;
  usageType: UsageType;
  favorite?: boolean;
  // phone/email/web:
  value?: string;
  // postal:
  street?: string; number?: string; zip?: string; city?: string;
  region?: string; countryCode?: string; // ISO 3166-1 alpha-2
}
```

### 3.1 Identity (person)

| Source                                   | vCard 3.0                                  |
|------------------------------------------|--------------------------------------------|
| last / first / middle / prefix / suffix  | `N:Last;First;Middle;Prefix;Suffix`        |
| display name                             | `FN:First Last`                            |
| nickname                                 | `NICKNAME:...`                             |
| birthday (privileged only, DSG-sensitive)| `BDAY:YYYY-MM-DD`                          |
| avatar (optional)                        | `PHOTO;ENCODING=b;TYPE=JPEG:<base64>`      |

**Avatar handling.** Embed the image as base64, do **not** emit a bare imgix/URL
reference. Rationale: Apple Contacts is unreliable at fetching remote `PHOTO` URIs on
import; a URL only works while the asset stays publicly and permanently reachable
(signed/expiring imgix URLs break); and a public link to a person's face inside an
exported file is a DSG-relevant dangling reference that outlives platform control.
Use imgix to render a bounded best-quality JPEG, then embed the bytes:

```
https://<source>.imgix.net/<avatar>?fm=jpg&w=512&q=80&auto=compress
```

Target ≤ ~512 px and a few tens of KB so iCloud accepts the card and the `.vcf` stays
small (relevant for the 100-record tier-3 cap, §6.2). The generator fetches and
base64-encodes server-side (§7); if no avatar exists, omit `PHOTO` entirely.

### 3.2 Identity (organization)

Apple shows a card as a company when `N` is empty and `X-ABShowAs:COMPANY` is present:

```
N:;;;;
FN:<orgName>
ORG:<orgName>
X-ABShowAs:COMPANY
```

**Org links (privileged tiers only).** For privileged / memberAdmin exports, include
the org's parent/child organizations and **all persons linked to it via `WorkRel`** as
item-grouped related names (§3.5). These are omitted for registered (tier 1) org
exports. There is no separate "key contacts" notion — every `WorkRel` person is
included.

```
item1.X-ABRELATEDNAMES:Holding AG
item1.X-ABLabel:Parent organization
item2.X-ABRELATEDNAMES:Tochter GmbH
item2.X-ABLabel:Subsidiary
item3.X-ABRELATEDNAMES:Anna Muster
item3.X-ABLabel:CFO          ← role/title from the WorkRel, fallback "Contact"
```

Parent/child links derive from the org hierarchy; the related persons are all `WorkRel`s
pointing at the org, labelled with each person's role/title where available (fallback
`Contact`). Parent/child links live under the `orgLinks` toggle and the persons under
the `workRels` toggle (§5), each shown only when present.

### 3.3 Channels

`usageType` maps to a vCard `TYPE` token; `favorite` adds the `PREF` token.

| ChannelType | vCard line (example)                                    |
|-------------|---------------------------------------------------------|
| phone       | `TEL;TYPE=WORK,VOICE,PREF:+41 44 123 45 67`             |
| email       | `EMAIL;TYPE=HOME,INTERNET,PREF:jane@example.ch`         |
| postal      | `ADR;TYPE=WORK:;;Bahnhofstrasse 1;Zürich;ZH;8001;Switzerland` + matching `LABEL` |
| web         | `URL:https://example.ch` (label via item grouping, §3.5)|

`ADR` field order is: `;PO;Ext;Street;Locality;Region;PostalCode;Country`. Compose
`Street` as `"<street> <number>"`. Emit the country **name** (not the ISO code) for
display, derived from `countryCode`.

### 3.4 WorkRel → employment

vCard carries only one `ORG`/`TITLE`/`ROLE`, and Apple/Google show a single company
per contact. There is **no need to designate a "primary" employer** — multiple
concurrent `WorkRel`s are rare. Emit the first by stable order (e.g. most recent
`startDate`, else array order) as the native employment block:

```
ORG:<companyName>;<department?>
TITLE:<jobTitle?>
ROLE:<role?>
```

Emit every **additional** `WorkRel` as an item-grouped related company (§3.5), labelled
with its role/department where available, falling back to `Employer`:

```
item4.X-ABRELATEDNAMES:Zweitfirma AG
item4.X-ABLabel:Employer
```

This round-trips into Apple and Google "Related people" and avoids any "primary"
decision the data can't justify.

For an **org card** the `WorkRel` direction reverses: the related parties are the
*persons* employed there, emitted as item-grouped related names per §3.2 rather than as
`ORG`/`TITLE`.

### 3.5 PersonalRel → related names (Apple extension)

vCard 3.0 has no standard `RELATED`. Apple uses item-grouped `X-ABRELATEDNAMES`:

```
item1.X-ABRELATEDNAMES:Anna Muster
item1.X-ABLabel:_$!<Spouse>!$_
item2.X-ABRELATEDNAMES:Max Muster
item2.X-ABLabel:Child
```

- Map known relation kinds to Apple's predefined labels where they exist
  (`_$!<Spouse>!$_`, `_$!<Child>!$_`, `_$!<Parent>!$_`, `_$!<Friend>!$_`, …);
  otherwise emit the relation kind as a plain custom label.
- The same `itemN.` grouping is reused to attach custom labels to `URL` and to extra
  employers from §3.4. Use one monotonic counter `N` across the whole card.

### 3.6 Scope per tier (what actually gets emitted)

- **Tier 1 (registered):** `N`/`FN` + at most one `TEL`, one `EMAIL`, one `ADR` —
  the entries flagged `favorite`. No relations, no workrels, no org links, no photo,
  no birthday. This is a **genuine data boundary**: registered users only have favorite
  address fields available to them at all (see read-model note, §7), so non-favorite
  fields are never in scope.
- **Tier 2/3 (privileged / memberAdmin):** everything the scope dialog selected — all
  channels/usages, `PersonalRel`, all `WorkRel`s, birthday, photo, and (for orgs)
  parent/child + key-contact links.

---

## 4. Capability resolution

A single pure function decides, given role + context, what the user may do. Keep it in
a shared util so the item action and the context-menu function agree.

```ts
interface VcardCapability {
  allowed: boolean;
  maxTargets: number;          // 0 (none), 1 (single), or 100 (memberAdmin cap)
  scope: 'favorites' | 'full';
  promptForScope: boolean;     // show the selection modal?
}

function resolveVcardCapability(
  role: RoleName,
  selectionCount: number,
): VcardCapability {
  if (role >= RoleName.memberAdmin) {
    return { allowed: selectionCount <= 100, maxTargets: 100, scope: 'full', promptForScope: true };
  }
  if (role >= RoleName.privileged) {
    return { allowed: selectionCount <= 1, maxTargets: 1, scope: 'full', promptForScope: true };
  }
  if (role >= RoleName.registered) {
    return { allowed: selectionCount <= 1, maxTargets: 1, scope: 'favorites', promptForScope: false };
  }
  return { allowed: false, maxTargets: 0, scope: 'favorites', promptForScope: false };
}
```

Use the existing role comparison helper rather than `>=` if roles are not ordinal.

---

## 5. Scope selection (tiers 2 & 3)

`promptForScope === true` opens a modal that is **data-driven**: a toggle is shown only
if the underlying data exists. For a single target (tier 2), inspect that record. For a
selection (tier 3), show the **union** of categories present across the selection and
apply each category per record where present.

```ts
interface ExportScope {
  identity: true;            // always on, not toggleable
  addresses: ChannelType[];  // subset of available channels
  birthday: boolean;
  photo: boolean;
  workRels: boolean;         // person: employers · org: linked persons
  personalRels: boolean;
  orgLinks: boolean;         // orgs only: parent/child organizations
}
```

Modal behaviour:

- toggles default **on** for every available category;
- hide categories with zero data (e.g. no `PersonalRel` → no "Relationships" toggle);
- for **persons**, hide `orgLinks`; for **orgs**, hide `personalRels`/`birthday` and
  offer `addresses`, `orgLinks` (parent/child) and `workRels` (the linked persons);
- footer shows the resulting record count (tier 3, capped at 100) and a confirm button.

Component: `VcardExportScopeModalComponent` (standalone, Ionic modal, signals for the
toggle state).

---

## 6. UI placement

### 6.1 Per-item action (tiers 1 & 2)

On the person/org list item, add the export to the existing per-item action surface
(sliding option or overflow popover). Visible only when
`resolveVcardCapability(role, 1).allowed`.

```
[ list item ] → ⋯ → "Als vCard exportieren"
```

Flow: resolve capability → (tier 2) open scope modal → generate → trigger download.

### 6.2 Selection-mode function (tier 3)

In multi-select mode, expose the export in the selection context menu, gated by
`role >= memberAdmin` **and** the relevant menu permission (same pattern as
`EsignListPage`). It reads the current selection signal:

```ts
readonly selectedIds = signal<string[]>([]);
```

Flow: resolve capability → open scope modal (union of categories) → generate one
`.vcf` with N cards → download. Disable the entry when the selection is empty.

**Hard cap: 100 records.** When the selection exceeds 100, disable the action and show
a hint ("max. 100 Kontakte pro Export"), or offer to export the first 100. The callable
re-checks the cap server-side (§7) and rejects oversized requests.

---

## 7. Generation path: callable Cloud Function

All three tiers route through one callable, `vcardExport`. Even though vCard text is
trivial to build in the browser, three requirements make the server the right home:

1. **Scope enforcement.** Tier 1 is favorites-only, tiers 2/3 are full. Firestore rules
   gate *document* reads, not individual fields, so scope must be enforced where the
   data is assembled.
2. **Activity logging.** Every export must produce an activity entry (below); doing this
   server-side makes it reliable and tamper-evident rather than dependent on a client
   write.
3. **Avatar fetch + encode.** Pulling the imgix render and base64-encoding it (§3.1)
   belongs server-side.

**Read-model decision (resolves former open Q1).** Registered users only have favorite
address fields available to them — non-favorite channels are never exposed to the
`registered` role. Field-level restriction is not expressible in Firestore rules within
a single document, so favorite values are surfaced through a read path the `registered`
role can reach (e.g. a denormalized favorite-contact projection), while full address
sets are gated to `privileged`+. The callable enforces the same favorites-only scope
for tier 1 as defence in depth.

```ts
// callable: vcardExport
interface VcardExportRequest {
  tenantId: string;
  targetIds: string[];          // 1 for tiers 1/2, ≤100 for tier 3
  targetKind: 'person' | 'org';
  scope: ExportScope;
}
interface VcardExportResponse {
  filename: string;             // e.g. contacts-export-2026-06-11.vcf
  vcardBase64?: string;         // inline payload (small exports)
  downloadUrl?: string;         // signed Storage URL (large exports, see note)
  recordCount: number;
}
```

The function:
1. re-derives the caller's role for `tenantId` and recomputes `resolveVcardCapability`;
2. rejects `targetIds.length > maxTargets` (hard cap **100**) and any `scope` exceeding
   the role's allowance — never trust the client's `scope`;
3. fetches records with the Admin SDK applying its own tenant + role filter; for tier 1
   reads only favorite channels;
4. fetches and downscales avatars via imgix, base64-encodes them (§3.1);
5. builds the `.vcf` with the shared generator (shared code, byte-identical to any
   client use);
6. writes **one activity entry** for the export operation (§9);
7. returns the payload (see size note).

**Payload size note.** With embedded photos, 100 records can approach the callable
response limit (~10 MB). Guard it: if the generated `.vcf` exceeds a safe threshold
(e.g. ~6 MB), write it to a short-lived Storage object and return a signed
`downloadUrl` instead of `vcardBase64`. Small exports (the common single-record case)
return inline.

The generator `buildVCard(record, scope): string` lives in shared code so any future
client-side use stays consistent with the server.

---

## 8. Download trigger (browser)

The client receives either an inline `vcardBase64` or a `downloadUrl` (§7) and triggers
the download:

```ts
function downloadVcfResponse(res: VcardExportResponse): void {
  if (res.downloadUrl) { window.location.assign(res.downloadUrl); return; }
  const bytes = Uint8Array.from(atob(res.vcardBase64!), c => c.charCodeAt(0));
  const blob = new Blob([bytes], { type: 'text/vcard;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = res.filename;
  a.click();
  URL.revokeObjectURL(url);
}
```

Filename: single target → `<fn-slug>.vcf`; multi → `contacts-export-<ISO-date>.vcf`.
MIME `text/vcard`. On iOS Safari the download opens the share/import sheet directly,
which is the intended Apple Contacts hand-off.

---

## 9. Activity & DSG compliance

**Activity entry (one per export).** Every `vcardExport` call writes exactly one
activity entry for the operation (not one per record), so the export is reflected in the
platform activity feed and is auditable for DSG accountability:

```ts
interface VcardExportActivity {
  type: 'vcard.export';
  tenantId: string;
  actorId: string;
  targetKind: 'person' | 'org';
  targetIds: string[];        // the data subjects exported
  scope: ExportScope;         // what categories left the platform
  recordCount: number;
  createdAt: Timestamp;
}
```

Recording `targetIds` and `scope` means the activity log shows *which* data subjects
were disclosed and *what* was included — the relevant facts if a subject later exercises
DSG access/objection rights.

DSG notes:

- Treat every privileged/admin export as a personal-data disclosure; the activity entry
  is the record of it.
- `BDAY`, `PHOTO`, and `PersonalRel` are the most sensitive fields — they are toggles,
  default-on but visible, so the operator makes a conscious choice.
- The generated `.vcf` leaves the platform's retention boundary; no server-side copy is
  kept beyond the short-lived Storage object for large exports (§7), which expires. The
  activity log records the event, not the payload.
- Embedding the avatar (vs a public URL, §3.1) avoids a dangling external reference to a
  data subject's image.

---

## 10. Resolved decisions

1. **Registered read model** — registered users only have favorite address fields
   available; non-favorite fields are never in scope. Tier 1 is a genuine boundary, and
   all tiers route through the callable (§3.6, §7).
2. **Org links** — privileged/admin org exports include parent/child organizations
   (`orgLinks`) and **all** `WorkRel` persons (`workRels`) as item-grouped related
   names; no separate "key contacts" concept. Registered org exports include neither
   (§3.2).
3. **Multiple WorkRels** — no "primary" employer is designated; the first by stable
   order populates `ORG`/`TITLE`/`ROLE`, extras are emitted as item-grouped companies
   (§3.4).
4. **Avatar** — fetch a bounded best-quality JPEG via imgix and embed it as base64; no
   bare URL reference (§3.1).
5. **Tier-3 cap** — hard limit of 100 records, enforced client- and server-side; large
   payloads fall back to a signed Storage URL (§4, §6.2, §7).
6. **Activity** — one activity entry per export operation, recording targetIds and
   scope (§9).

## 11. Remaining open items

- **Avatar source** — confirm the field on `PersonModel`/`OrgModel` that holds the
  avatar reference, and the imgix source host, so the §3.1 transform URL is concrete
  rather than a placeholder.

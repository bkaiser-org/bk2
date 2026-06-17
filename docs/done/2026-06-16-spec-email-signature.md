# Spec: Personalised Email Signature Export

**Module:** Profile / Identity
**Status:** Draft
**Stack:** Angular (standalone, signals), Ionic v8, Capacitor, Firebase (Firestore, optional Cloud Function), imgix-hosted assets, pnpm
**Related work:** vCard export (`vcardExport`) — shares the "personal data + default org" assembly. The imgix logo host is now pinned (§5); align the vCard avatar/logo source to the same `bkaiser.imgix.net/tenant/[TENANT]/…` convention.

---

## 1. Goal

From their profile, a bk2 user can generate a personalised HTML email signature, preview it, and copy it into their email client (Gmail, Outlook on Windows/Mac, Apple Mail on macOS/iOS). The signature shows the user's personal details and the logo, name and address of their **default organisation**.

Reference layout (from the supplied example):

```
Bruno Kaiser            ← display name, bold, large
Finanzen                ← function / role
+41 79 790 8929         ← phone (tel: link)
                        ← vertical gap
[LOGO]   Seeclub Stäfa            ← logo left; org name bold
         8712 Stäfa, SWITZERLAND  ← org address
```

---

## 2. Key design facts (why the feature is shaped this way)

There is **no email-signature file format standard**. A signature is an HTML fragment injected into the message body. The only near-standard is the plain-text `-- ` delimiter (RFC 3676), which is plain text only. Consequences that drive the whole design:

1. **Email-safe HTML only.** Table-based layout (no flexbox/grid), fully inline CSS (no `<style>` blocks, no classes, no external CSS), absolute `https://` image URLs (no CID, no base64), fixed pixel dimensions, width ≤ 600px. Outlook on Windows renders via the Microsoft Word engine and is the strictest target — design for it first.
2. **No universal "import signature" mechanism.** Each client installs differently:
   - **Gmail (web):** paste rendered content into Settings → Signature. Has a ~10,000-character limit; proxies/caches images.
   - **Outlook (new / web / Microsoft 365):** paste rendered content into the signature editor. Roaming signatures sync across devices.
   - **Outlook (Windows desktop, classic):** paste into editor, or drop a `.htm` file into `%APPDATA%\Microsoft\Signatures\`.
   - **Apple Mail (macOS):** no HTML field. Either (a) paste the *rendered* block into the signature box and uncheck "Always match my default message font", or (b) edit the `~/Library/Mail/V*/MailData/Signatures/*.mailsignature` file directly and lock it.
   - **Apple Mail (iOS):** plain rich-paste only; complex layouts degrade.
3. **The copy mechanism matters.** To paste as *formatted* content the clipboard must carry a `text/html` flavour, not just `text/plain`. Note that Safari copies a webarchive bundle whose local image refs break on paste into Apple Mail; a programmatic `ClipboardItem` write with an explicit `text/html` blob avoids this and is the reliable path.
4. **Dark mode is now default** on Apple Mail, Gmail iOS and Outlook M365. Use a **PNG logo with transparency** (never JPEG — the white box shows in dark mode). Avoid relying on a white background behind the logo.

**Conclusion:** the feature is not "copy one fragment". It is: let the user pick their **email client** and a **copy format** (`html` / `raw`), produce a client-adapted output, render a live preview, copy it via the right clipboard mechanism, and show a **short install guide for that client** (with `raw` explained as the fallback).

---

## 3. Data model

### 3.1 Signature inputs (fed to the template)

```ts
/** Resolved, presentation-ready signature inputs. */
export interface SignatureModel {
  person: {
    displayName: string;      // "Bruno Kaiser" — from profile
    functionLabel?: string;   // "Finanzen" — free text from the form (§6.1), optional
    phoneE164?: string;       // "+41797908929" — canonical E.164 (source of truth)
    email?: string;           // optional, not in the reference layout
  };
  org: {
    name: string;             // "Seeclub Stäfa"
    addressLine: string;      // "8712 Stäfa, SWITZERLAND" (pre-composed)
    websiteUrl?: string;      // logo link target
    logoUrl: string;          // absolute imgix URL (§5)
  };
}
```

No `locale` field — the function label is free text entered by the user and is **not** localised.

**Phone.** E.164 (`phoneE164`) is the single source of truth. The display string in the template is derived from it with `libphonenumber-js` (`formatNumber(phoneE164, 'INTERNATIONAL')` → `+41 79 790 8929`); the `tel:` href uses the raw E.164. This matches the `phone` field already specified for the forms builder.

### 3.2 Form state (what the user controls)

The only editable signature content is the optional function; the rest of the form is delivery configuration.

```ts
export type EmailClient =
  | 'gmail'            // Gmail web
  | 'outlook-web'      // new Outlook / OWA / Microsoft 365
  | 'outlook-win'      // Outlook for Windows, classic desktop
  | 'apple-mail-mac'   // Apple Mail, macOS
  | 'apple-mail-ios';  // Apple Mail, iOS

export type CopyFormat = 'html' | 'raw';

export interface SignatureFormState {
  functionLabel: string;   // optional org function, free text, no i18n
  client: EmailClient;     // dropdown selection (§6.1)
  format: CopyFormat;      // 'html' = formatted paste, 'raw' = source text (§6)
}
```

`functionLabel`, `client` and `format` are all **ephemeral local UI state** (component signals) — nothing is persisted server-side. The function is re-entered each session; this keeps the feature stateless and side-effect-free.

### 3.3 Resolving the default org

`SignatureModel` is built from the user's profile, the form's `functionLabel`, and the default-org membership:

- **Default org** = `profile.defaultOrgId` if set, else the user's primary/first active membership. If none, the accordion is disabled with a hint to join or select an org.
- **functionLabel** — from local form state (free text), not persisted, not derived from role.
- **phoneE164** — from the person's contact info, stored as E.164.
- **org.name / addressLine** — from the org record; compose `addressLine` from postal code + city + country once so the template stays dumb.
- **logoUrl** — see §5.

### 3.4 Output

```ts
export interface SignatureRender {
  html: string;   // email-safe HTML fragment (client-adapted, §6.1)
  text: string;   // plain-text fallback, prefixed with "-- \n"
}
```

---

## 4. The HTML template (single source of truth)

A **pure function** `renderSignature(model: SignatureModel): SignatureRender` produces the **base** email-safe signature. A second pure function `adaptForClient(render, client)` (§6.1) applies client-specific hardening. Preview and every copy path run the same pipeline, so what the user sees is exactly what they install.

Email-safe template matching the reference layout (tables, inline CSS, `<br>` instead of block `<div>`s for Outlook safety):

```html
<table role="presentation" cellpadding="0" cellspacing="0" border="0"
       style="border-collapse:collapse;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;">
  <tr>
    <td style="padding:0;font-size:20px;font-weight:bold;line-height:1.3;color:#000000;">Bruno Kaiser</td>
  </tr>
  <tr>
    <td style="padding:3px 0 0 0;font-size:13px;line-height:1.4;color:#333333;">Finanzen</td>
  </tr>
  <tr>
    <td style="padding:3px 0 0 0;font-size:15px;line-height:1.4;color:#555555;">
      <a href="tel:+41797908929" style="color:#555555;text-decoration:none;">+41 79 790 8929</a>
    </td>
  </tr>
  <tr><td style="height:16px;line-height:16px;font-size:0;">&nbsp;</td></tr>
  <tr>
    <td style="padding:0;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
        <tr>
          <td valign="middle" style="padding:0 16px 0 0;">
            <a href="https://www.seeclub-staefa.ch" style="text-decoration:none;">
              <img src="https://bkaiser.imgix.net/tenant/[TENANT]/logo/google-touch-icon.png?w=96&h=96&fit=clip&dpr=2"
                   width="96" height="96" alt="Seeclub Stäfa"
                   style="display:block;border:0;outline:none;width:96px;height:96px;" />
            </a>
          </td>
          <td valign="middle" style="font-size:14px;line-height:1.45;color:#333333;">
            <span style="font-size:15px;font-weight:bold;color:#000000;">Seeclub Stäfa</span><br>
            8712 Stäfa, SWITZERLAND
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
```

Template rules:
- All values HTML-escaped on interpolation (names/orgs may contain `&`, `<`, accents).
- Omit empty rows (`functionLabel`, `phone`, `websiteUrl` are optional) rather than rendering blank lines.
- Logo `<a>` is dropped if `websiteUrl` is absent; `<img>` still renders.
- Keep colours as literal hex; no CSS variables (not supported in mail).

Plain-text fallback (`text`):

```
-- 
Bruno Kaiser
Finanzen
+41 79 790 8929

Seeclub Stäfa
8712 Stäfa, SWITZERLAND
```

---

## 5. Logo / image hosting

- **URL pattern (confirmed):** `https://bkaiser.imgix.net/tenant/[TENANT]/logo/google-touch-icon.png`, where `[TENANT]` is replaced with the default org's tenant id at render time. Append imgix sizing: `?w=96&h=96&fit=clip&dpr=2` for a crisp 96 px logo on retina.
- Pin `width`/`height` attributes on the `<img>` (Outlook ignores CSS-only sizing) at the logical px size.
- **Public asset (confirmed):** the logo is fetched unauthenticated by recipients' mail clients and is intended to be public.
- **Transparency (confirmed):** the PNG has a transparent background, so it sits cleanly on dark-mode clients with no visible tile.
- Optional later: a dark-mode logo variant swapped via `@media (prefers-color-scheme: dark)` — enhancement only, since several clients strip `<style>`.

---

## 6. Component (Angular / Ionic)

Follows the **`profile-privacy` pattern**: a form rendered inside an `ion-accordion`. This component is built on **Angular Signal Forms** (using the `vest-bridge.ts` infrastructure's host pattern, but **no Vest suite and no validation** — there are no constraints to enforce: the function is free optional text, and the client/format selectors always hold a valid value). The form is just three signals bound to controls.

```
profile/
  email-signature/
    email-signature.component.ts     ← ion-accordion + Signal Forms + preview + install guide
    signature.service.ts             ← model assembly, render pipeline, clipboard
    signature-template.ts            ← renderSignature() base template
    signature-client-adapter.ts      ← adaptForClient() + per-client install guides
    signature.model.ts               ← SignatureModel, SignatureFormState, EmailClient, CopyFormat
```

### Accordion layout (inside `ion-accordion-group`)

A single accordion panel `value="email-signature"`, header e.g. *"E-Mail-Signatur"*. Body contains, top to bottom:

1. **Function** — `ion-input`, label *"Funktion (optional)"*, bound to the `functionLabel` signal. Free text, no i18n, no validation.
2. **E-Mail-Client** — `ion-select` dropdown, the five `EmailClient` values (Gmail / Outlook (neu) / Outlook (Windows) / Apple Mail (Mac) / Apple Mail (iPhone)).
3. **Format** — `ion-segment` with two buttons: **HTML** (`format='html'`) and **Raw** (`format='raw'`).
4. **Vorschau** — live preview in a sandboxed `<iframe srcdoc>` so signature inline styles can't leak into the app (or be overridden by it). Re-renders reactively from `functionLabel` + `client`.
5. **Kopieren** button — copies in the selected `format`, adapted for the selected `client` (§6.3).
6. **Install guide** — short, client-specific steps for the current selection, plus the raw-mode fallback note (§6.2).

### 6.1 Per-client adaptation — `adaptForClient(render, client)`

The base `renderSignature` output is hardened per client. Pure function, no side effects:

```ts
export function adaptForClient(base: SignatureRender, client: EmailClient): ClientPlan { … }

export interface ClientPlan {
  client: EmailClient;
  html: string;                 // client-adapted email-safe HTML
  text: string;                 // plain-text fallback
  recommendedFormat: CopyFormat; // pre-selects the segment when client changes
  guide: InstallGuide;          // steps + rawFallback (§6.2)
}
```

| Client | HTML adaptation | Recommended format | Notes |
|---|---|---|---|
| `gmail` | Base template as-is (Gmail strips `<style>`/classes — we have none). Stays well under the ~10k-char limit. | `html` | Gmail re-hosts the image via its proxy. |
| `outlook-web` | Base template as-is; accepts rich paste, roaming-signature safe. | `html` | — |
| `outlook-win` | **Word-engine hardening:** inject `mso-line-height-rule:exactly;` alongside every `line-height`; keep all spacing in table rows/cells (never `<p>`/margins); keep explicit `width`/`height` on the logo. Optionally wrap the spacer row in `<!--[if mso]>…<![endif]-->`. | `html` | If rich paste still mangles spacing, the guide steers the user to `raw` + the `.htm` file method. |
| `apple-mail-mac` | Base template as-is (WebKit renders it well). | `html` | Use the programmatic `ClipboardItem` write (§6.3) — avoids Safari's webarchive-bundle problem. `raw` is offered for the `.mailsignature` file method. |
| `apple-mail-ios` | Base template as-is; simplest variant. | `html` | Best set up on Mac and synced; iOS rich-paste degrades complex layouts. |

`recommendedFormat` only pre-selects the segment when the client changes; the user can still override.

### 6.2 Install guide — `InstallGuide`

```ts
export interface InstallGuide {
  title: string;          // e.g. "Apple Mail (Mac)"
  steps: string[];        // 3–5 short imperative steps for the chosen format
  rawFallback: string;    // one paragraph: what raw mode is and when to use it
}
```

Only the guide for the **currently selected client** is shown (not an accordion of all clients). Indicative content:

- **Gmail (web):** Settings (gear) → *See all settings* → *General* → *Signature* → *Create new* → paste (⌘/Ctrl-V) → *Save changes*.
- **Outlook (neu/web):** Settings → *Mail* → *Compose and reply* → paste into the signature box → *Save*.
- **Outlook (Windows, klassisch):** *File* → *Options* → *Mail* → *Signatures…* → *New* → paste → *OK*. *Fallback:* save the raw output as `signatur.htm` in `%APPDATA%\Microsoft\Signatures\`.
- **Apple Mail (Mac):** *Mail* → *Settings* → *Signatures* → add a signature, **uncheck "Always match my default message font"**, then paste. *Tip:* if pasting from a browser, use Chrome, not Safari. *Fallback:* edit the placeholder `~/Library/Mail/V*/MailData/Signatures/*.mailsignature` file, paste the raw HTML below the metadata lines, then lock the file.
- **Apple Mail (iPhone):** *Settings* → *Mail* → *Signature* → paste. Complex layouts may simplify; prefer setting up on Mac and syncing.

**Raw-mode fallback (shown under every client):** *Raw mode copies the signature's HTML source as plain text instead of formatted content. Use it when the client offers an HTML/source field, or for the file-based methods above (Outlook `.htm`, Apple Mail `.mailsignature`) where you paste the markup directly into a file rather than into a rich editor.*

### 6.3 Copy — format-aware

```ts
async function copy(plan: ClientPlan, format: CopyFormat): Promise<void> {
  if (format === 'raw') {
    // source text → for HTML/source fields and the file-based methods
    await navigator.clipboard.writeText(plan.html);
    return;
  }
  // 'html' → formatted paste into a rich signature editor
  const item = new ClipboardItem({
    'text/html':  new Blob([plan.html], { type: 'text/html' }),
    'text/plain': new Blob([plan.text], { type: 'text/plain' }),
  });
  await navigator.clipboard.write([item]); // inside the click handler (user gesture)
}
```

- `format='html'`: the explicit `text/html` flavour is what makes Gmail/Outlook/Apple-Mail paste *formatted* content, and sidesteps the Safari webarchive issue.
- `format='raw'`: `writeText` puts the markup on the clipboard as plain text for source fields / file methods.
- `navigator.clipboard.*` needs a secure context (PWA over HTTPS — satisfied) and a user gesture (behind the button — satisfied).
- **Fallback** for older engines: a hidden `contenteditable` + `document.execCommand('copy')`. Detect and degrade gracefully.

### 6.4 `SignatureService`
- `model: Signal<SignatureModel | null>` — derived from current user + form `functionLabel` + default org.
- `plan: Signal<ClientPlan | null>` — `adaptForClient(renderSignature(model), form.client)`, recomputed reactively.
- `copy(format): Promise<void>` — per §6.3 using the current `plan`.

---

## 7. Generation: client-side vs Cloud Function

**Recommendation: generate client-side.** The signature is deterministic presentation built from data the client already has; client-side gives instant preview, no cold-start, and no PII round-trip. `renderSignature` + `adaptForClient` are pure TS functions shared by the preview and every copy path.

Keep the function **transport-agnostic** so it can later be lifted into a callable Cloud Function *unchanged* if org-managed signatures (§9) are added — at which point the same template renders server-side for consistency.

---

## 8. Privacy / compliance (DSG)

- The signature contains the user's own personal data (name, function, phone), exported by the user for their own use — no additional consent needed.
- Org logo/name/address are org data; any active member may use them in their signature. No cross-member data is exposed.
- The logo URL is fetched unauthenticated by recipients' mail clients — confirm the org logo asset is intended to be public before exposing it (it generally is, being on outbound mail anyway).
- No personal data in URL query strings; the `tel:` and website links carry only already-public values.

---

## 9. Out of scope / future work

- **Org-managed signatures.** Industry trend is centrally managed, enforced signatures pushed to all members. This maps cleanly onto the vCard export permission tiers (registered / privileged / memberAdmin): a `memberAdmin` could define a locked org template, members self-serve-copy it. Would reuse `renderSignature` server-side. Defer.
- **Dark-mode logo variant swapping.**
- **Direct Gmail API / Outlook Graph install** (write the signature into the account programmatically via connectors) — removes the manual paste step but adds OAuth scope and complexity. Defer.
- **Multiple signatures** (per org for multi-membership users) — current scope is the single default org.

---

## 10. Open items

All resolved:
- ✅ Logo URL: `https://bkaiser.imgix.net/tenant/[TENANT]/logo/google-touch-icon.png`.
- ✅ Logo asset is public for unauthenticated recipient fetch.
- ✅ Logo PNG has a transparent background — dark-mode safe.
- ✅ Function label is free-text user input, optional, no i18n, **not persisted** (ephemeral local state).
- ✅ Phone source of truth is E.164 (display derived via `libphonenumber-js`).
- ✅ Built on Angular Signal Forms, **no validation / no Vest suite** (no constraints to enforce).

No open items remain; spec is implementation-ready.

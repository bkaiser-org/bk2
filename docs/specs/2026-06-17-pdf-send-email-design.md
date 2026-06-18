# PDF "Senden" — Email the generated document

**Date:** 2026-06-17
**Type:** design
**Status:** specified, not yet implemented

## 1. Purpose & scope

Today the PDF preview modal ([`PdfPreviewModal`](../../libs/pdf-template/ui/src/lib/pdf-preview.modal.ts))
only lets the user **download** the generated document. We add a second action, **"Senden"**, that lets
the user email the generated document directly from the preview.

Clicking **Senden** opens an email composer modal with:

- **To** prefilled with the payer's email (when known), still editable.
- **Cc / Bcc** (optional, comma-separated).
- **Subject** (defaulted, editable).
- A rich-text **message body** (the existing `bk-editor`).

On confirm, the composed message — wrapped in a branded, responsive HTML email template — is sent with
the generated PDF **attached**, via the existing `sendEmail` Cloud Function.

### Out of scope

- Bulk / multi-recipient member mailing — that is the job of the existing
  [`MessageCenterModal`](../../libs/cms/section/feature/src/lib/message-center.modal.ts) (a member-list
  picker). This feature is single-document, single-(payer)-recipient.
- Saving drafts, send history/audit log, scheduling.
- Non-PDF output formats: the Senden button is offered only when `outputFormat === 'pdf'`.

### Why a new modal (not reusing `MessageCenterModal`)

`MessageCenterModal` is a **recipient picker**, not a composer: its body is a checkbox list of all members
with group filter + search, it has **no message-body field** (the caller supplies the HTML, e.g.
`buildEmailHtml(section)` in `section.store.ts`), and it has **no attachment concept**. Reusing it would
mean making the member-picker optional and bolting on a body editor + attachment handling — coupling two
unrelated flows and risking the working CMS newsletter path. A focused composer is the cleaner, isolated
unit. The **send call is the only shared concern**, and it is already shared: both flows invoke the same
`sendEmail` callable.

## 2. Components & data flow

```
DocButton ──generate()──▶ generateDocument CF ──▶ { url, storagePath, filename, outputFormat, ... }
   │
   │ opens (autoOpenPreview, pdf only)
   ▼
PdfPreviewModal  [url, title, filename, outputFormat, storagePath, recipientEmail?, recipientName?]
   │   ├─ Herunterladen (existing)
   │   └─ Senden ─────────┐ opens
   ▼                      ▼
                  EmailComposerModal  [to(prefill), recipientName?, storagePath, filename, outputFormat]
                          │  builds branded HTML (AppStore branding) + calls send service
                          ▼
              DocEmailService.sendDocumentByEmail(...) ──▶ sendEmail CF
                          │                                   │ downloads storagePath from Storage,
                          │                                   │ attaches PDF, sends via mailtrap_api
                          ▼
                     success/error toast → dismiss
```

### 2.1 `DocButton` (extend) — `libs/pdf-template/ui/src/lib/doc-button.ts`

Add two **optional** inputs:

```ts
public readonly recipientEmail = input<string | undefined>(undefined);
public readonly recipientName  = input<string | undefined>(undefined);
```

When opening the preview modal, forward `response.storagePath`, `recipientEmail()`, `recipientName()`
into `componentProps`. If `recipientEmail` is not supplied, the composer simply opens with an empty,
editable To field.

### 2.2 `PdfPreviewModal` (extend) — `libs/pdf-template/ui/src/lib/pdf-preview.modal.ts`

New inputs:

```ts
public readonly storagePath    = input<string>('');
public readonly recipientEmail = input<string | undefined>(undefined);
public readonly recipientName  = input<string | undefined>(undefined);
```

Add a **Senden** button (icon `mail`) in the footer toolbar (and header buttons) next to *Herunterladen*,
shown only when `outputFormat() === 'pdf'` and `storagePath()` is set. Clicking it calls `send()`:

```ts
protected async send(): Promise<void> {
  const modal = await this.modalController.create({
    component: EmailComposerModal,
    componentProps: {
      to: this.recipientEmail() ?? '',
      recipientName: this.recipientName(),
      storagePath: this.storagePath(),
      filename: this.filename(),
      outputFormat: this.outputFormat(),
    },
  });
  await modal.present();
}
```

The preview modal stays open behind the composer; the composer dismisses itself on send/cancel.

### 2.3 `EmailComposerModal` (new) — `libs/pdf-template/ui/src/lib/email-composer.modal.ts`

Single-purpose composer (~120 lines). Layout mirrors the input-field style of `MessageCenterModal`
(`ion-toolbar`/`ion-item` headers) but with a `bk-editor` body in `ion-content`.

**Inputs**

```ts
public readonly to            = input<string>('');             // prefill, editable
public readonly recipientName = input<string | undefined>(undefined);
public readonly storagePath   = input.required<string>();
public readonly filename      = input.required<string>();
public readonly outputFormat  = input<'pdf' | 'docx' | 'html'>('pdf');
```

**State (signals)**

- `toField`, `cc`, `bcc` — `linkedSignal`/`signal<string>` (comma-separated for cc/bcc).
- `subject` — `linkedSignal(() => 'Dokument: ' + this.filename())`.
- `body` — `signal<string>('<p></p>')`, bound to `bk-editor` via `[(content)]`.
- `isSending` — `signal(false)` to disable the Send button + show a spinner.

**Dependencies (inject)**

- `AppStore` — for branding (org name, logo URL, contact email) and `env.appId`.
- `DocEmailService` (new) — the send call.
- `ModalController`, `ToastController`.

**UI**

- Header toolbar (`color="secondary"`): *Abbrechen* (start), title "Dokument senden", *Senden* (end,
  disabled while `isSending()`).
- Collapsible-style input toolbars for **An / Cc / Bcc / Betreff** (reuse the `ion-input` + label pattern
  from `MessageCenterModal`).
- A read-only **attachment chip** showing the filename (`<ion-chip>` with a paperclip icon) so the user
  sees what will be sent.
- `ion-content`: `<bk-editor [(content)]="body" />` for the message body.

**confirm() / send()**

```ts
const cfg = this.appStore.appConfig();                  // org name, logoUrl, opEmail
const imgixBaseUrl = this.appStore.env.services.imgixBaseUrl;
const rel = getImgixUrl(cfg.logoUrl, 'fm=png&w=240&auto=compress');
const logoUrl = rel.startsWith('tenant') ? `${imgixBaseUrl}/${rel}` : rel;
const html = buildBrandedEmailHtml(this.body(), {
  orgName: cfg.name,
  logoUrl,                       // absolute PNG imgix URL
  contactEmail: cfg.opEmail,
  attachmentFilename: this.filename(),
});
await this.docEmailService.sendDocumentByEmail({
  to: parseEmails(this.toField()),
  cc: parseEmails(this.cc()),
  bcc: parseEmails(this.bcc()),
  from: branding.opEmail,
  subject: this.subject(),
  html,
  storagePath: this.storagePath(),
  filename: this.filename(),
});
```

Show a success toast (`Dokument gesendet an …`) on resolve, an error toast on reject, then
`modalController.dismiss({ sent: true }, 'confirm')`. **Cancel** → `dismiss(null, 'cancel')`.

Validation: To must contain at least one address; the Send button is disabled otherwise.

### 2.4 `buildBrandedEmailHtml` (new pure util) — `libs/pdf-template/util/src/lib/email-html.util.ts`

```ts
export interface BrandedEmailOptions {
  orgName: string;
  logoUrl?: string;
  contactEmail?: string;
  attachmentFilename?: string;
}
export function buildBrandedEmailHtml(bodyHtml: string, opts: BrandedEmailOptions): string;
```

Returns a self-contained, **inline-CSS**, table-based responsive HTML email:

- **Header bar** — logo + `orgName`, brand colour background (`#25265e`, matching the editor heading
  colour already used in the app).
  - **Logo resolution:** `AppConfig.logoUrl` is a **Storage-relative path** (e.g.
    `tenant/<id>/logo/logo_round.svg`) and is typically an **SVG**, which many email clients don't render.
    The composer resolves it to an absolute, **PNG** imgix URL before passing it to the template, using the
    existing pattern (cf. [img.ts:220-223](../../libs/shared/ui/src/lib/img.ts#L220-L223)):

    ```ts
    // in EmailComposerModal, using AppStore.env.services.imgixBaseUrl
    const rel = getImgixUrl(appConfig.logoUrl, 'fm=png&w=240&auto=compress'); // SVG → PNG via imgix
    const logoUrl = rel.startsWith('tenant') ? `${imgixBaseUrl}/${rel}` : rel;
    ```

    `buildBrandedEmailHtml` receives this already-absolute PNG URL and renders an `<img>`; if `logoUrl`
    is empty it degrades to a **text-only** header (org name on the brand-colour bar).
- **Body** — the `bodyHtml` from the editor, inside a max-width (600px) white card.
- **Attachment note** — `📎 Beilage: <attachmentFilename>` line (only when provided).
- **Footer** — muted small text with `orgName` and `contactEmail` (mailto link).

Pure function, fully unit-testable. No Angular/DOM dependencies.

### 2.5 `DocEmailService` (new) — `libs/pdf-template/data-access/src/lib/doc-email.service.ts`

Thin wrapper over the existing `sendEmail` callable (same `getFunctions(getApp(),'europe-west6')` +
emulator-guard pattern as `DocGenerationService`):

```ts
export interface SendDocumentByEmailRequest {
  to: string[]; cc?: string[]; bcc?: string[];
  from: string; subject: string; html: string;
  storagePath: string; filename: string;
}

public async sendDocumentByEmail(req: SendDocumentByEmailRequest): Promise<void> {
  const callable = httpsCallable(this.functions, 'sendEmail');
  await callable({
    to: req.to, cc: req.cc, bcc: req.bcc,
    from: req.from, subject: req.subject, html: req.html,
    provider: 'mailtrap_api',
    appId: this.env.appId,
    attachments: [{ storagePath: req.storagePath, filename: req.filename }],
  });
}
```

## 3. Cloud Function change — extend `sendEmail`

File: `apps/functions/src/auth/index.ts` (the `sendEmail` callable) + `auth/email-transport.ts`.

### 3.1 Accept attachment references

Extend the callable request type with:

```ts
attachments?: { storagePath: string; filename?: string }[];
```

`EmailOptions.attachments` already exists in `email-transport.ts` and is honoured by both
`sendViaSMTP` and `sendViaMailtrapApi` — no transport change needed.

### 3.2 Resolve attachments server-side (mirror esign-send-by-email)

For each `attachments[]` entry, the CF:

1. **Validates the path** against an allowed generated-docs prefix (see 3.3) — reject otherwise with
   `invalid-argument`.
2. Downloads the object via the Admin SDK default bucket:
   `const [buf] = await getStorage().bucket().file(storagePath).download();`
3. Infers `contentType` from the extension (`.pdf` → `application/pdf`, fallback
   `application/octet-stream`) and `filename` from the entry or the path basename.
4. Pushes `{ filename, content: buf, contentType }` into the `EmailOptions.attachments` array passed to
   `sendEmailViaProvider`.

This keeps the request body small (no base64 over the wire) and reuses the existing attachment plumbing.

### 3.3 Security

- Keep `enforceAppCheck: true` and `checkAuthentication` (attachments are never sent on the
  unauthenticated password-reset path — that path supplies no `attachments`).
- **Path allow-list:** `generateDocument` writes to `generated-docs/<tenantId>/<userId>/<id>.<ext>`
  (persist) or `generated-docs-ephemeral/<tenantId>/<id>.<ext>` (ephemeral)
  ([generate-document.ts:234-236](../../apps/functions/src/pdf/generate-document.ts#L234-L236)). Only
  permit `storagePath` values starting with `generated-docs/` or `generated-docs-ephemeral/`, and reject
  any path containing `..`, so the callable cannot be coerced into reading arbitrary Storage objects.
- Cap the number/size of attachments (e.g. max 1 attachment for this flow, size already bounded by the
  generated PDF).

## 4. i18n

Add keys to the `pdf-template` scope (`libs/pdf-template/util/src/lib/pdf-template-i18n.ts` + the lib's
`de.json`), following the `i18n` skill:

- `@pdfTemplate.send.label` — "Senden"
- `@pdfTemplate.composer.title` — "Dokument senden"
- `@pdfTemplate.composer.to`, `.cc`, `.bcc`, `.subject`, `.body`, `.attachment`
- `@pdfTemplate.composer.send`, `.cancel`
- `@pdfTemplate.composer.sentToast` — "Dokument gesendet"
- `@pdfTemplate.composer.errorToast` — "Senden fehlgeschlagen"

(Defaults may be inlined as German literals initially, matching the current modal which uses literal
German strings; wire to the store i18n if the surrounding components adopt it.)

## 5. Testing

- **Unit (Vitest):**
  - `buildBrandedEmailHtml` — header/body/footer present, attachment line conditional on
    `attachmentFilename`, `logoUrl`/`contactEmail` optional, body HTML passed through.
  - `parseEmails` helper — trims, splits on comma, drops empties.
- **CF:** unit-test the storagePath allow-list validation (accepts a valid docs path, rejects traversal /
  out-of-prefix paths) and contentType inference.
- **Manual:** generate an invoice PDF → preview → Senden → verify prefilled payer address, edit body,
  send, confirm receipt with PDF attached and branded layout.

## 6. Files touched

| File | Change |
|------|--------|
| `libs/pdf-template/ui/src/lib/doc-button.ts` | add optional `recipientEmail`/`recipientName` inputs; forward `storagePath` + recipient to preview modal |
| `libs/pdf-template/ui/src/lib/pdf-preview.modal.ts` | add inputs + **Senden** button + `send()` opening composer |
| `libs/pdf-template/ui/src/lib/email-composer.modal.ts` | **new** composer modal |
| `libs/pdf-template/util/src/lib/email-html.util.ts` | **new** `buildBrandedEmailHtml` + `parseEmails` |
| `libs/pdf-template/util/src/lib/email-html.util.spec.ts` | **new** unit tests |
| `libs/pdf-template/data-access/src/lib/doc-email.service.ts` | **new** `DocEmailService` |
| `libs/pdf-template/util/src/lib/pdf-template-i18n.ts` + `de.json` | new i18n keys |
| `apps/functions/src/auth/index.ts` | accept + resolve `attachments[]` (storagePath → buffer) with path allow-list |
| barrel `index.ts` files in pdf-template ui/util/data-access | export new symbols |

## 7. Resolved decisions

- **Provider:** `mailtrap_api` (not `mailgun_smtp`).
- **Storage allow-list prefix:** `generated-docs/` and `generated-docs-ephemeral/` (see 3.3).
- **From / contact:** `AppConfig.opEmail`.
- **Logo:** resolved to an absolute **PNG** imgix URL via `getImgixUrl(logoUrl, 'fm=png&…')` +
  `imgixBaseUrl` (SVG → PNG so email clients render it); empty `logoUrl` → text-only header (see 2.4).

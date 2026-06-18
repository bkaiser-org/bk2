# QR Payment Slip — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Optionally append a Swiss QR-bill payment slip as a second page to a generated document, with the org as payee and the payload address as payer.

**Architecture:** Two boolean flags on `TemplateModel` drive it. `generateDocument` resolves the payee server-side from the owner org's favorite `bankaccount` (IBAN) and `postal` (address) addresses, injects `{{payee.*}}` into the Handlebars context, and — when enabled — renders the slip as an SVG that is appended to the HTML as a second A4 page (Puppeteer renders it in one pass, no PDF merge).

**Tech Stack:** Angular/Ionic (editor), Firebase Cloud Functions (Node/esbuild), `swissqrbill/svg`, Handlebars, Vitest.

**Design:** [`2026-06-17-qr-payment-slip-design.md`](../specs/2026-06-17-qr-payment-slip-design.md)

**Conventions:** TDD where logic is pure; commit after each task. Type-check libs with `npx tsc --noEmit -p libs/<domain>/<layer>/tsconfig.json`. Pure helpers go in `@bk2/shared-util-functions` (functions-usable, has Vitest).

---

### Task 1: Add QR-slip flags to TemplateModel

**Files:**
- Modify: `libs/shared/models/src/lib/pdf-template.model.ts`

- [ ] **Step 1: Add the two fields**

In `class TemplateModel`, after `public payloadSchema = '';` add:

```ts
  public attachQrSlip = false;       // append a QR payment slip as a second page
  public qrSlipWithAmount = false;   // fill the slip amount from payload.amount
```

- [ ] **Step 2: Build shared-models so dependents see the new fields**

Run: `pnpm nx build shared-models`
Expected: `Successfully ran target build`.

- [ ] **Step 3: Commit**

```bash
git add libs/shared/models/src/lib/pdf-template.model.ts
git commit -m "feat(models): add attachQrSlip/qrSlipWithAmount to TemplateModel"
```

---

### Task 2: `parseSwissAmount` helper (pure, TDD)

**Files:**
- Create: `libs/shared/util-functions/src/lib/qr-slip.util.ts`
- Test: `libs/shared/util-functions/src/lib/qr-slip.util.spec.ts`
- Modify: `libs/shared/util-functions/src/index.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { parseSwissAmount } from './qr-slip.util';

describe('parseSwissAmount', () => {
  it('parses a Swiss-formatted string with apostrophe', () => {
    expect(parseSwissAmount("1'000.00")).toBe(1000);
  });
  it('parses a curly apostrophe', () => {
    expect(parseSwissAmount('1’500.50')).toBe(1500.5);
  });
  it('parses a plain decimal', () => {
    expect(parseSwissAmount('250.50')).toBe(250.5);
  });
  it('accepts a number', () => {
    expect(parseSwissAmount(42)).toBe(42);
  });
  it('returns undefined for empty/invalid', () => {
    expect(parseSwissAmount('')).toBeUndefined();
    expect(parseSwissAmount('abc')).toBeUndefined();
    expect(parseSwissAmount(undefined)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test shared-util-functions -- qr-slip`
Expected: FAIL — cannot find module `./qr-slip.util`.

- [ ] **Step 3: Implement**

In `qr-slip.util.ts`:

```ts
/** Parse a (possibly Swiss-formatted) amount string into a number, or undefined. */
export function parseSwissAmount(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  const cleaned = String(value).replace(/['’\s]/g, '');
  if (cleaned === '') return undefined;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : undefined;
}
```

- [ ] **Step 4: Export from the barrel**

Add to `libs/shared/util-functions/src/index.ts`:

```ts
export * from './lib/qr-slip.util';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm nx test shared-util-functions -- qr-slip`
Expected: PASS (6 assertions).

- [ ] **Step 6: Commit**

```bash
git add libs/shared/util-functions/src/lib/qr-slip.util.ts libs/shared/util-functions/src/lib/qr-slip.util.spec.ts libs/shared/util-functions/src/index.ts
git commit -m "feat(util-functions): parseSwissAmount helper"
```

---

### Task 3: `pickFavoriteByChannel` helper (pure, TDD)

**Files:**
- Modify: `libs/shared/util-functions/src/lib/qr-slip.util.ts`
- Modify: `libs/shared/util-functions/src/lib/qr-slip.util.spec.ts`

- [ ] **Step 1: Add the failing test**

Append to `qr-slip.util.spec.ts`:

```ts
import { pickFavoriteByChannel } from './qr-slip.util';
import { AddressModel } from '@bk2/shared-models';

const addr = (over: Partial<AddressModel>): AddressModel =>
  ({ ...new AddressModel('t1'), ...over });

describe('pickFavoriteByChannel', () => {
  it('prefers the favorite address of the channel', () => {
    const list = [
      addr({ addressChannel: 'bankaccount', iban: 'A', isFavorite: false }),
      addr({ addressChannel: 'bankaccount', iban: 'B', isFavorite: true }),
    ];
    expect(pickFavoriteByChannel(list, 'bankaccount')?.iban).toBe('B');
  });
  it('falls back to the first matching when none is favorite', () => {
    const list = [addr({ addressChannel: 'bankaccount', iban: 'A' })];
    expect(pickFavoriteByChannel(list, 'bankaccount')?.iban).toBe('A');
  });
  it('skips archived and returns undefined when none match', () => {
    const list = [addr({ addressChannel: 'postal', isArchived: true })];
    expect(pickFavoriteByChannel(list, 'postal')).toBeUndefined();
    expect(pickFavoriteByChannel(list, 'bankaccount')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test shared-util-functions -- qr-slip`
Expected: FAIL — `pickFavoriteByChannel` is not a function.

- [ ] **Step 3: Implement**

Append to `qr-slip.util.ts`:

```ts
import { AddressModel } from '@bk2/shared-models';

/** Pick the favorite (else first) non-archived address of the given channel. */
export function pickFavoriteByChannel(
  addresses: AddressModel[],
  channel: string,
): AddressModel | undefined {
  const matching = addresses.filter(a => a.addressChannel === channel && !a.isArchived);
  return matching.find(a => a.isFavorite) ?? matching[0];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm nx test shared-util-functions -- qr-slip`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/shared/util-functions/src/lib/qr-slip.util.ts libs/shared/util-functions/src/lib/qr-slip.util.spec.ts
git commit -m "feat(util-functions): pickFavoriteByChannel helper"
```

---

### Task 4: `buildQrSlipData` + types (pure, TDD)

**Files:**
- Modify: `libs/shared/util-functions/src/lib/qr-slip.util.ts`
- Modify: `libs/shared/util-functions/src/lib/qr-slip.util.spec.ts`

- [ ] **Step 1: Add the failing test**

Append to `qr-slip.util.spec.ts`:

```ts
import { buildQrSlipData, QrPayee } from './qr-slip.util';

const payee: QrPayee = {
  name: 'Gönnerverein', iban: 'CH64 8080 8003 3249 8735 9',
  street: 'Seestrasse', buildingNumber: '1', zip: '8712', city: 'Stäfa', country: 'CH',
};
const payload = {
  firstName: 'Anna', lastName: 'Muster', streetName: 'Dorfweg', streetNumber: '5',
  zipCode: '8000', city: 'Zürich', countryCode: 'CH', amount: "1'000.00",
};

describe('buildQrSlipData', () => {
  it('builds creditor with a space-stripped IBAN', () => {
    const d = buildQrSlipData(payee, payload, false);
    expect(d.creditor.account).toBe('CH6480808003324987359');
    expect(d.currency).toBe('CHF');
  });
  it('maps the debtor from payload', () => {
    const d = buildQrSlipData(payee, payload, false);
    expect(d.debtor?.name).toBe('Anna Muster');
    expect(d.debtor?.zip).toBe('8000');
  });
  it('omits amount when withAmount is false', () => {
    expect(buildQrSlipData(payee, payload, false).amount).toBeUndefined();
  });
  it('includes parsed amount when withAmount is true', () => {
    expect(buildQrSlipData(payee, payload, true).amount).toBe(1000);
  });
  it('omits the debtor when payload lacks name/city/zip', () => {
    expect(buildQrSlipData(payee, {}, false).debtor).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test shared-util-functions -- qr-slip`
Expected: FAIL — `buildQrSlipData` is not a function.

- [ ] **Step 3: Implement**

Append to `qr-slip.util.ts`:

```ts
export interface QrPayee {
  name: string; iban: string; street: string; buildingNumber: string;
  zip: string; city: string; country: string;
}
export interface QrSlipParty {
  name: string; address: string; buildingNumber?: string;
  zip: string; city: string; country: string;
}
export interface QrSlipData {
  creditor: QrSlipParty & { account: string };
  currency: 'CHF';
  amount?: number;
  debtor?: QrSlipParty;
}

const s = (v: unknown): string => (v === null || v === undefined ? '' : String(v));

function buildDebtor(payload: Record<string, unknown>): QrSlipParty | undefined {
  const name = `${s(payload['firstName'])} ${s(payload['lastName'])}`.trim();
  const zip = s(payload['zipCode']);
  const city = s(payload['city']);
  if (!name || !zip || !city) return undefined;
  const buildingNumber = s(payload['streetNumber']);
  return {
    name,
    address: s(payload['streetName']),
    ...(buildingNumber ? { buildingNumber } : {}),
    zip, city,
    country: s(payload['countryCode']) || 'CH',
  };
}

/** Build a swissqrbill-shaped Data object from the resolved payee + the payload. */
export function buildQrSlipData(
  payee: QrPayee,
  payload: Record<string, unknown>,
  withAmount: boolean,
): QrSlipData {
  const amount = withAmount ? parseSwissAmount(payload['amount']) : undefined;
  const debtor = buildDebtor(payload);
  return {
    creditor: {
      account: payee.iban.replace(/\s/g, ''),
      name: payee.name,
      address: payee.street,
      ...(payee.buildingNumber ? { buildingNumber: payee.buildingNumber } : {}),
      zip: payee.zip,
      city: payee.city,
      country: payee.country || 'CH',
    },
    currency: 'CHF',
    ...(amount !== undefined ? { amount } : {}),
    ...(debtor ? { debtor } : {}),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm nx test shared-util-functions -- qr-slip`
Expected: PASS (all groups).

- [ ] **Step 5: Build the lib + commit**

```bash
pnpm nx build shared-util-functions
git add libs/shared/util-functions/src/lib/qr-slip.util.ts libs/shared/util-functions/src/lib/qr-slip.util.spec.ts
git commit -m "feat(util-functions): buildQrSlipData + QR slip types"
```

---

### Task 5: Function-side payee resolution + SVG rendering

**Files:**
- Create: `apps/functions/src/pdf/qr-slip.ts`

No unit test (Firestore IO + SVG render; covered by manual verification in Task 6). The pure mapping is already tested in Tasks 2-4.

- [ ] **Step 1: Implement the module**

```ts
// apps/functions/src/pdf/qr-slip.ts
import type { Firestore } from 'firebase-admin/firestore';
import { SwissQRBill } from 'swissqrbill/svg';
import type { Data } from 'swissqrbill/types';

import { AppConfigCollection, OrgCollection, AddressCollection, AddressModel } from '@bk2/shared-models';
import { pickFavoriteByChannel, QrPayee, QrSlipData } from '@bk2/shared-util-functions';

/**
 * Resolve the payee (creditor) from the owner org: name from the org, IBAN from
 * its favorite bankaccount address, postal address from its favorite postal
 * address. Best-effort — returns empty strings for missing parts; the caller
 * decides whether a missing IBAN is fatal.
 */
export async function resolvePayee(db: Firestore, tenantId: string): Promise<QrPayee> {
  const configSnap = await db.collection(AppConfigCollection).doc(tenantId).get();
  const ownerOrgId = (configSnap.data()?.['ownerOrgId'] as string) || tenantId;

  const orgSnap = await db.collection(OrgCollection).doc(ownerOrgId).get();
  const orgName = (orgSnap.data()?.['name'] as string) ?? '';

  const addrSnap = await db.collection(AddressCollection)
    .where('parentKey', '==', `org.${ownerOrgId}`).get();
  const addresses = addrSnap.docs.map(d => ({ bkey: d.id, ...d.data() }) as AddressModel);

  const bank = pickFavoriteByChannel(addresses, 'bankaccount');
  const postal = pickFavoriteByChannel(addresses, 'postal');

  return {
    name: orgName,
    iban: bank?.iban ?? '',
    street: postal?.streetName ?? '',
    buildingNumber: postal?.streetNumber ?? '',
    zip: postal?.zipCode ?? '',
    city: postal?.city ?? '',
    country: postal?.countryCode || 'CH',
  };
}

/** Render the QR-bill payment slip as an SVG string. */
export function renderQrSlipSvg(data: QrSlipData): string {
  return new SwissQRBill(data as unknown as Data, { language: 'DE' }).toString();
}

/** Wrap the slip SVG in a second A4 page, pinned to the bottom 105 mm. */
export function buildQrSlipPageHtml(svg: string): string {
  return `<div style="page-break-before: always; position: relative; width: 210mm; height: 297mm;">`
    + `<div style="position: absolute; bottom: 0; left: 0; width: 210mm;">${svg}</div>`
    + `</div>`;
}
```

- [ ] **Step 2: Verify it type-checks via the functions build**

Run: `pnpm nx build functions --configuration development`
Expected: build succeeds (no TS errors; `skipTypeCheck` is on, so also run `npx tsc --noEmit -p apps/functions/tsconfig.app.json` and expect no errors in `qr-slip.ts`).

- [ ] **Step 3: Commit**

```bash
git add apps/functions/src/pdf/qr-slip.ts
git commit -m "feat(functions/pdf): payee resolution + QR slip SVG rendering"
```

---

### Task 6: Wire the slip into `generateDocument`

**Files:**
- Modify: `apps/functions/src/pdf/generate-document.ts`

- [ ] **Step 1: Import the new helpers**

After the existing `import { compileTemplate } ...` group, add:

```ts
import { resolvePayee, renderQrSlipSvg, buildQrSlipPageHtml } from './qr-slip';
import { buildQrSlipData } from '@bk2/shared-util-functions';
```

- [ ] **Step 2: Inject payee into the Handlebars context and append the slip**

In the template branch, replace:

```ts
      // Compile template (cached)
      const cacheKey = `${templateId}@${resolvedVersion}`;
      const compiled = await compileTemplate(cacheKey, version.html, version.css);

      htmlToRender = compiled(payload);
```

with:

```ts
      // Resolve the org payee once; exposed to the template as {{payee.*}} and
      // used to build the QR slip.
      const payee = await resolvePayee(db, tenantId);

      // Compile template (cached)
      const cacheKey = `${templateId}@${resolvedVersion}`;
      const compiled = await compileTemplate(cacheKey, version.html, version.css);

      htmlToRender = compiled({ ...payload, payee });

      // Append the QR payment slip as a second page (PDF output only).
      if (tmpl.attachQrSlip && outputFormat === 'pdf') {
        if (!payee.iban) {
          throw new HttpsError('failed-precondition', 'No payee IBAN configured for organisation');
        }
        const slipData = buildQrSlipData(payee, payload, !!tmpl.qrSlipWithAmount);
        htmlToRender += buildQrSlipPageHtml(renderQrSlipSvg(slipData));
      }
```

(`db`, `tmpl`, `outputFormat`, and `payload` are already in scope in this branch.)

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit -p apps/functions/tsconfig.app.json`
Expected: no errors.

- [ ] **Step 4: Deploy and verify manually**

Run: `pnpm run deploy:functions`
Then in the app: open a template, enable "QR-Einzahlungsschein anhängen" (Task 7 must be done, or temporarily set the flag in Firestore), generate a preview. Expected: page 2 shows a QR-bill slip with the org as payee, the sample address as payer; with "amount" off the amount field is blank, with it on the amount is filled.

- [ ] **Step 5: Commit**

```bash
git add apps/functions/src/pdf/generate-document.ts
git commit -m "feat(functions/pdf): append QR payment slip + expose {{payee}} context"
```

---

### Task 7: Editor checkboxes

**Files:**
- Modify: `libs/pdf-template/feature/src/lib/template-edit.page.ts`

- [ ] **Step 1: Import IonCheckbox**

Add `IonCheckbox` to the `@ionic/angular/standalone` import list and to the component `imports` array.

- [ ] **Step 2: Add the two checkboxes in the Metadaten tab**

In the `@if(activeTab() === 'metadata')` block, after the Beispieldaten `<ion-item>`, add:

```html
          <ion-item>
            <ion-checkbox
              [checked]="tmpl.attachQrSlip"
              (ionChange)="onTemplateFieldChange('attachQrSlip', $any($event).detail.checked)"
              [disabled]="readOnly()">
              QR-Einzahlungsschein anhängen
            </ion-checkbox>
          </ion-item>
          <ion-item>
            <ion-checkbox
              [checked]="tmpl.qrSlipWithAmount"
              (ionChange)="onTemplateFieldChange('qrSlipWithAmount', $any($event).detail.checked)"
              [disabled]="readOnly() || !tmpl.attachQrSlip">
              Betrag im Einzahlungsschein ausfüllen
            </ion-checkbox>
          </ion-item>
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit -p libs/pdf-template/feature/tsconfig.json`
Expected: no errors. (`onTemplateFieldChange(field, value: unknown)` already accepts booleans and sets `dirty`.)

- [ ] **Step 4: Commit**

```bash
git add libs/pdf-template/feature/src/lib/template-edit.page.ts
git commit -m "feat(pdf-template): QR slip checkboxes in template editor"
```

---

### Task 8: Migrate both template footers to `{{payee.*}}` and re-seed

**Files:**
- Modify: `scripts/templates/gss-spendenbestaetigung.hbs`
- Modify: the membership-fee invoice `.hbs` (e.g. `scripts/templates/gss-rechnung-mitgliederbeitrag.hbs`)
- Run: the corresponding seed script(s) under `scripts/`

- [ ] **Step 1: Replace the hardcoded payee in each footer**

In each `.hbs`, replace the hardcoded org name / IBAN / address in the footer with Handlebars expressions:

```html
{{payee.name}}<br>
{{payee.street}} {{payee.buildingNumber}}, {{payee.zip}} {{payee.city}}<br>
IBAN: {{payee.iban}}
```

(Match the existing footer markup; only swap the literal values for `{{payee.*}}`.)

- [ ] **Step 2: Re-seed the templates into Firestore**

Run the seed script(s) that publish these templates (e.g. `node scripts/seed-template.mjs` or the per-template seed). Expected: console confirms each template version was written. This creates a new version with the templatized footer.

- [ ] **Step 3: Verify the footer renders from payee data**

Generate a preview of each template. Expected: the footer IBAN/address now matches the org's resolved payee data and equals the QR-slip IBAN.

- [ ] **Step 4: Commit**

```bash
git add scripts/templates/
git commit -m "feat(pdf-template): drive template footers from {{payee.*}}"
```

---

## Self-Review

- **Spec coverage:** schema (T1), server-side payee resolution (T5/T6), SVG second page (T5/T6), amount mapping (T2/T4/T6), reference NON (T4 — no reference field set), footer migration both templates (T8), editor UI (T7). All covered.
- **Type consistency:** `QrPayee`/`QrSlipData`/`buildQrSlipData`/`pickFavoriteByChannel`/`parseSwissAmount` are defined in `qr-slip.util.ts` (Tasks 2-4) and consumed unchanged in Tasks 5-6. `resolvePayee`/`renderQrSlipSvg`/`buildQrSlipPageHtml` defined in T5, used in T6.
- **Open implementation detail:** exact membership-template filename and footer markup are confirmed against the repo in Task 8.

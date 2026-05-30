# Validation i18n Refactor — Design

**Date:** 2026-05-30
**Status:** Approved

## Problem

`vest.util.ts` mixes validation logic with i18n knowledge. It uses `@validation.${fieldName}NotNull` style keys as vest error messages, coupling the pure utility to the translation system. Two messages are hardcoded German strings. The individual `*.validations.ts` files are inconsistent — most use the `@key` convention but a handful have bare or German codes.

## Goal

- `vest.util.ts` becomes a pure validation utility — no i18n knowledge, no `@` prefixes
- A single dispatch rule in `ErrorNote` handles the mapping to Transloco
- All domain validation files follow a consistent convention

## Convention

Two categories of validation message, distinguished by `@` prefix:

| Category | Producer | Format | Example |
|---|---|---|---|
| Generic | `vest.util.ts` shared functions | bare semantic code | `'required'`, `'tooLong'` |
| Domain-specific | individual `*.validations.ts` | `@full.i18n.key` | `'@membershipExitAfterEntry'` |

**Rule:** if a validation message is produced by a shared `vest.util.ts` helper, it must be a bare code. If it is domain-specific, it must use the `@` prefix pointing to a full Transloco key.

## Section 1 — ErrorNote dispatch rule

`libs/shared/ui/src/lib/error-note.ts` — `translate()` method:

```ts
private translate(keys: string[]): Observable<string> {
  if (!keys || keys.length === 0) return of('');
  const key = keys[0];
  if (key.startsWith('@')) {
    return this.translocoService.selectTranslate(key.substring(1)); // domain key, unchanged
  } else {
    return this.translocoService.selectTranslate(`validation.${key}`); // bare code → validation namespace
  }
}
```

No other change to `ErrorNote`.

## Section 2 — vest.util.ts code mapping

All `test()` calls in `libs/shared/util-core/src/lib/vest.util.ts` use bare semantic codes:

| Current (mixed/dynamic) | New bare code |
|---|---|
| `@validation.${fieldName}NotNull` | `notNull` |
| `@validation.${fieldName}NotUndefined` | `notUndefined` |
| `@validation.${fieldName}TypeString` | `notString` |
| `@validation.${fieldName}Required` | `required` |
| `Die Eingabe darf nicht aus mehr als ${maxLength}…` | `tooLong` |
| `Die Eingabe muss aus mind. ${minLength}…` | `tooShort` |
| `booleanMandatory` | `notBoolean` |
| `notNull` (boolean/number) | `notNull` |
| `notUndefined` (boolean/number) | `notUndefined` |
| `numberMandatory` | `notNumber` |
| `integerMandatory` | `notInteger` |
| `enumValue` | `invalidEnum` |
| `minWrong` | `tooSmall` |
| `maxWrong` | `tooLarge` |
| `stringMandatory` | `notString` |
| `validValue` | `invalidValue` |
| `arrayMandatory` | `notArray` |
| `containsRequiredValue` | `missingRequiredValue` |
| `validDate` | `invalidDate` |
| `validTime` | `invalidTime` |
| `validDateTime` | `invalidDateTime` |
| `@validation.tenantsLength` | `tenantsLength` |
| `@validation.tenantsType` | `tenantsType` |
| `@validation.tenantValid` | `tenantValid` |
| `@validation.urlStart` | `urlStart` |
| `@validation.urlValidProtocol` | `urlValidProtocol` |
| `@validation.urlHost` | `urlHost` |
| `@validation.urlParts` | `urlParts` |
| `@validation.avatarFormat`, `isAvatarInfo` | `avatarFormat` |
| `@validation.moneyFormat`, `isMoneyModel` | `moneyFormat` |
| `` `${fieldName} should be ${shouldBe}` `` | `invalidValue` |

## Section 3 — Domain validation files to fix

Four files have bare codes that would collide with the `validation.` namespace after the ErrorNote change:

### `libs/subject/address/util/src/lib/address.validations.ts`

9 bare codes → `@address.*` keys:

| Current | New |
|---|---|
| `addressCustomChannelLabelMandatory` | `@address.customChannelLabelMandatory` |
| `addressCustomUsageLabelMandatory` | `@address.customUsageLabelMandatory` |
| `addressZipCodeMandatory` | `@address.zipCodeMandatory` |
| `addressCityMandatory` | `@address.cityMandatory` |
| `addressCountryMandatory` | `@address.countryMandatory` |
| `addressCountryUppercase` | `@address.countryUppercase` |
| `addressCountryLength` | `@address.countryLength` |
| `addressSwissZipCodeNumeric` | `@address.swissZipCodeNumeric` |
| `addressSwissZipCodeLength` | `@address.swissZipCodeLength` |

Add `libs/subject/address/util/src/i18n/de.json` with German translations for all 9 keys under `"address"`.

### `libs/relationship/membership/util/src/lib/scs-member-fee.validations.ts`

9 English/mixed codes (all `greaterThanOrEquals(0)` checks plus one `isNotEmpty`):

| Current | New |
|---|---|
| `'jb must be >= 0'` | `tooSmall` (generic) |
| `'srv must be >= 0'` | `tooSmall` |
| `'bev must be >= 0'` | `tooSmall` |
| `'entryFee must be >= 0'` | `tooSmall` |
| `'locker must be >= 0'` | `tooSmall` |
| `'hallenTraining must be >= 0'` | `tooSmall` |
| `'skiff must be >= 0'` | `tooSmall` |
| `'skiffInsurance must be >= 0'` | `tooSmall` |
| `'state is required'` | `required` (generic) |

These are all numeric-minimum or required checks — the generic codes are accurate and no domain translation is needed.

### `libs/cms/menu/util/src/lib/menu-item.validations.ts`

| Current | New |
|---|---|
| `menuItemsType` | `@menu.itemsType` |

Add key to `libs/cms/menu/util/src/i18n/de.json` (create file if absent).

### `libs/cms/section/ui/src/lib/responsibility-section.validations.ts`

| Current | New |
|---|---|
| `'validation.required'` | `required` (bare generic code) |

## Section 4 — Translation keys

### `libs/shared/util-core/src/i18n/de.json`

Replace existing `validation` object with the full set of generic codes. Remove all dynamic per-field keys (e.g. `nameNotNull`, `nameRequired`) — they no longer exist. The existing url/tenant keys stay but are now reached via bare codes.

Full `validation` object after refactor:

```json
{
  "validation": {
    "notNull": "Pflichtfeld (null).",
    "notUndefined": "Pflichtfeld (undefined).",
    "notString": "Muss eine Zeichenkette sein.",
    "notBoolean": "Muss ein Wahrheitswert sein.",
    "notNumber": "Muss eine Zahl sein.",
    "notInteger": "Muss eine ganze Zahl sein.",
    "notArray": "Muss eine Liste sein.",
    "required": "Pflichtfeld.",
    "tooLong": "Die Eingabe ist zu lang.",
    "tooShort": "Die Eingabe ist zu kurz.",
    "tooSmall": "Der Wert ist zu klein.",
    "tooLarge": "Der Wert ist zu gross.",
    "invalidValue": "Ungültiger Wert.",
    "invalidEnum": "Ungültiger Auswahlwert.",
    "invalidDate": "Ungültiges Datum.",
    "invalidTime": "Ungültige Uhrzeit.",
    "invalidDateTime": "Ungültiges Datum/Uhrzeit.",
    "missingRequiredValue": "Ein erforderlicher Wert fehlt.",
    "avatarFormat": "Ungültiges Avatar-Format.",
    "moneyFormat": "Ungültiges Geldbetrags-Format.",
    "tenantsLength": "Es muss mind. ein Mandant existieren.",
    "tenantsType": "Die Mandanten müssen aus einem Array von Strings bestehen.",
    "tenantValid": "Ungültiger Mandant.",
    "urlStart": "Die URL muss mit https:// oder assets oder tenant oder / starten.",
    "urlValidProtocol": "Die URL muss ein gültiges Protokoll haben (https://).",
    "urlHost": "Die URL muss einen gültigen Hostnamen haben.",
    "urlParts": "Die URL darf keine _ oder . enthalten."
  }
}
```

### `libs/subject/address/util/src/i18n/de.json`

File already exists (has `validation.validIban`). Merge new keys under `"address"` namespace:

```json
{
  "address": {
    "customChannelLabelMandatory": "Kanalbezeichnung ist ein Pflichtfeld.",
    "customUsageLabelMandatory": "Verwendungsbezeichnung ist ein Pflichtfeld.",
    "zipCodeMandatory": "PLZ ist ein Pflichtfeld.",
    "cityMandatory": "Ort ist ein Pflichtfeld.",
    "countryMandatory": "Land ist ein Pflichtfeld.",
    "countryUppercase": "Ländercode muss in Grossbuchstaben sein.",
    "countryLength": "Ländercode muss genau 2 Zeichen lang sein.",
    "swissZipCodeNumeric": "Schweizer PLZ muss numerisch sein.",
    "swissZipCodeLength": "Schweizer PLZ muss 4 Stellen haben."
  }
}
```

### `libs/cms/menu/util/src/i18n/de.json`

Add (or create):

```json
{
  "menu": {
    "itemsType": "Menüeinträge müssen eine Liste sein."
  }
}
```

## Out of scope

- Adding `de.json` to libs that don't have one but whose validation files already use `@key` correctly — those already work
- Translating to other languages (en, fr, es, it) — not in scope of this refactor
- Changing how `I18nService.translate()` works — only `ErrorNote.translate()` changes

## Files changed summary

| File | Change |
|---|---|
| `libs/shared/ui/src/lib/error-note.ts` | Add bare-code branch to `translate()` |
| `libs/shared/util-core/src/lib/vest.util.ts` | All `test()` second args → bare codes |
| `libs/shared/util-core/src/i18n/de.json` | Replace with full generic `validation.*` set |
| `libs/subject/address/util/src/lib/address.validations.ts` | 9 codes → `@address.*` |
| `libs/subject/address/util/src/i18n/de.json` | Create with `address.*` translations |
| `libs/relationship/membership/util/src/lib/scs-member-fee.validations.ts` | 9 codes → generic bare codes |
| `libs/cms/menu/util/src/lib/menu-item.validations.ts` | `menuItemsType` → `@menu.itemsType` |
| `libs/cms/menu/util/src/i18n/de.json` | Add/create with `menu.itemsType` |
| `libs/cms/section/ui/src/lib/responsibility-section.validations.ts` | `'validation.required'` → `required` |

# Validation i18n Refactor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `vest.util.ts` a pure validation utility by moving all i18n knowledge into `ErrorNote`, which maps bare semantic error codes to the `validation.*` Transloco namespace.

**Architecture:** `ErrorNote.translate()` gains a two-branch rule: strings starting with `@` are domain-specific Transloco keys (existing behaviour, unchanged); bare strings are generic codes prefixed with `validation.` before Transloco lookup. `vest.util.ts` is stripped of all `@validation.*` prefixes and hardcoded German strings. Four domain validation files with bare codes are updated to use `@` or generic codes.

**Tech Stack:** Angular 20, `@jsverse/transloco`, `vest` / `ngx-vest-forms`, Vitest (jsdom), TypeScript strict, pnpm/Nx monorepo.

---

## Files modified

| File | Change |
|---|---|
| `libs/shared/ui/src/lib/error-note.ts` | Add bare-code branch to `translate()` |
| `libs/shared/util-core/src/lib/vest.util.ts` | All `test()` second args → bare semantic codes |
| `libs/shared/util-core/src/i18n/de.json` | Replace with full `validation.*` generic set |
| `libs/subject/address/util/src/lib/address.validations.ts` | 9 bare codes → `@address.*` |
| `libs/subject/address/util/src/i18n/de.json` | Merge new `address.*` translations |
| `libs/relationship/membership/util/src/lib/scs-member-fee.validations.ts` | 9 English codes → generic bare codes |
| `libs/cms/menu/util/src/lib/menu-item.validations.ts` | `menuItemsType` → `@menu.itemsType` |
| `libs/cms/menu/util/src/i18n/de.json` | Create with `menu.itemsType` translation |
| `libs/cms/section/ui/src/lib/responsibility-section.validations.ts` | `'validation.required'` → `'required'` |

---

## Task 1: Update ErrorNote dispatch rule

**Files:**
- Modify: `libs/shared/ui/src/lib/error-note.ts`

This is the foundation. After this change, bare codes resolve to `validation.<code>` in Transloco. Domain `@key` paths are unchanged.

- [ ] **Step 1: Update `translate()` in ErrorNote**

Replace only the `translate()` method body. The rest of the file is unchanged.

```ts
// libs/shared/ui/src/lib/error-note.ts
// Replace the existing translate() method:

  private translate(keys: string[]): Observable<string> {
    if (!keys || keys.length === 0) return of('');
    const key = keys[0];
    if (key.startsWith('@')) {
      return this.translocoService.selectTranslate(key.substring(1));
    } else {
      return this.translocoService.selectTranslate(`validation.${key}`);
    }
  }
```

- [ ] **Step 2: Type-check shared-ui**

```bash
npx tsc --noEmit -p libs/shared/ui/tsconfig.json
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add libs/shared/ui/src/lib/error-note.ts
git commit -m "refactor(error-note): dispatch bare codes to validation.* Transloco namespace"
```

---

## Task 2: Update vest.util.ts — bare semantic codes

**Files:**
- Modify: `libs/shared/util-core/src/lib/vest.util.ts`

Replace all `test()` second arguments with bare semantic codes. The full file after changes:

- [ ] **Step 1: Rewrite vest.util.ts**

```ts
import { LONG_NAME_LENGTH, NAME_LENGTH, SHORT_NAME_LENGTH, STORE_DATE_LENGTH, STORE_DATETIME_LENGTH, TIME_LENGTH, URL_LENGTH } from '@bk2/shared-constants';
import { enforce, omitWhen, test } from 'vest';
import { checkDate, DateFormat } from './date.util';
import { isArrayOfStrings, isAvatarInfo, isMoney } from './type.util';
import { AddressableModel, AvatarInfo, BkModel, isAddressableModel, isBaseModel, isNamedModel, isPersistedModel, isSearchableModel, isTaggedModel, MoneyModel, NamedModel, PersistedModel, SearchableModel, TaggedModel } from '@bk2/shared-models';

export function baseValidations(model: BkModel, givenTenants: string, givenTags: string, field?: string) {

  omitWhen(!isBaseModel(model), () => {
    stringValidations('bkey', model.bkey, SHORT_NAME_LENGTH);
  });

  omitWhen(!isNamedModel(model), () => {
    const m = model as unknown as NamedModel;
    stringValidations('name', m.name, NAME_LENGTH);
  });
  
  omitWhen(!isTaggedModel(model), () => {
    const m = model as unknown as TaggedModel;
    tagValidations('tags', m.tags, givenTags);
  });

  omitWhen(!isSearchableModel(model), () => {
    const m = model as unknown as SearchableModel;
    stringValidations('index', m.index, LONG_NAME_LENGTH);
  });

  omitWhen(!isAddressableModel(model), () => {
    const m = model as unknown as AddressableModel;
    stringValidations('favEmail', m.favEmail, SHORT_NAME_LENGTH);
    stringValidations('favPhone', m.favPhone, SHORT_NAME_LENGTH);
    stringValidations('favZipCode', m.favZipCode, SHORT_NAME_LENGTH);
  });

  omitWhen(!isPersistedModel(model), () => {
    const m = model as unknown as PersistedModel;
    booleanValidations('isArchived', m.isArchived, false);
  });
};


export function avatarValidations(fieldName: string, avatar: unknown) {

  omitWhen(!avatar, () => {
    test(fieldName, 'avatarFormat', () => {
      enforce(isAvatarInfo(avatar)).isTruthy();
    });

    test(fieldName, 'avatarFormat', () => {
      const avatarInfo = avatar as AvatarInfo;
      stringValidations(`${fieldName}.key`, avatarInfo.key, NAME_LENGTH, 4, true);
      stringValidations(`${fieldName}.name1`, avatarInfo.name1, LONG_NAME_LENGTH);
      stringValidations(`${fieldName}.name2`, avatarInfo.name2, LONG_NAME_LENGTH);
      stringsValidations(`${fieldName}.modelType`, avatarInfo.modelType, ['person', 'org', 'resource', 'user', 'group', 'account']);
      stringValidations(`${fieldName}.type`, avatarInfo.type, LONG_NAME_LENGTH);
      stringValidations(`${fieldName}.subType`, avatarInfo.subType, LONG_NAME_LENGTH);
      stringValidations(`${fieldName}.label`, avatarInfo.label, LONG_NAME_LENGTH);
    });
  });
} 

export function moneyValidations(fieldName: string, money: unknown) {
  omitWhen(!money, () => {
    test(fieldName, 'moneyFormat', () => {
      enforce(isMoney(money)).isTruthy();
    });

    test(fieldName, 'moneyFormat', () => {
      const moneyModel = money as MoneyModel;
      numberValidations(`${fieldName}.amount`, moneyModel.amount, true, 0);
      stringValidations(`${fieldName}.currency`, moneyModel.currency, 3, 3, true);
      stringsValidations(`${fieldName}.periodicity`, moneyModel.periodicity, ['once', 'daily', 'workdays', 'monthly', 'biweekly', 'monthly', 'quarterly', 'yearly']);
    });
  });
}

export function booleanValidations(fieldName: string, value: unknown, shouldBe?: boolean) {
  test(fieldName, 'notNull', () => {
    enforce(value).isNotNull();
  });
  test(fieldName, 'notUndefined', () => {
    enforce(value).isNotUndefined();
  });
  test(fieldName, 'notBoolean', () => {
    enforce(value).isBoolean();
  });
  omitWhen(shouldBe === undefined, () => {
    test(fieldName, 'invalidValue', () => {
      enforce(value).equals(shouldBe);
    });
  });
}

export function categoryValidations(fieldName: string, category: unknown, categoryEnum: object) {
  test(fieldName, 'notNull', () => {
    enforce(category).isNotNull();
  });
  test(fieldName, 'notUndefined', () => {
    enforce(category).isNotUndefined();
  });
  test(fieldName, 'notNumber', () => {
    enforce(category).isNumber();
  });
  test(fieldName, 'invalidEnum', () => {
    enforce(category).inside(Object.values(categoryEnum));
  });
}

export function stringsValidations(fieldName: string, value: unknown, validValues: string[]) {
  test(fieldName, 'notNull', () => {
    enforce(value).isNotNull();
  });
  test(fieldName, 'notUndefined', () => {
    enforce(value).isNotUndefined();
  });
  test(fieldName, 'notString', () => {
    enforce(value).isString();
  });
  test(fieldName, 'invalidValue', () => {
    enforce(value).inside(validValues);
  });
}

export function stringArrayValidations(fieldName: string, values: unknown, validValues: string[]) {
  test(fieldName, 'notNull', () => {
    enforce(values).isNotNull();
  });
  test(fieldName, 'notUndefined', () => {
    enforce(values).isNotUndefined();
  });
  test(fieldName, 'notArray', () => {
    enforce(Array.isArray(values)).isTruthy();
  });
  omitWhen(!Array.isArray(values), () => {
    (values as unknown[]).forEach(values => {
      test(fieldName, 'notString', () => {
        enforce(values).isString();
      });
    });
    (values as string[]).forEach((value, index) => {
      test(`${fieldName}[${index}]`, 'invalidValue', () => {
        enforce(value).inside(validValues);
      });
    });
  });
}

export function stringArrayContainsValidation(
  fieldName: string, 
  values: unknown, 
  requiredValues: string[],
  isMandatory = true
) {
  test(fieldName, 'notArray', () => {
    enforce(Array.isArray(values)).isTruthy();
  });

  omitWhen(!isMandatory, () => {
    test(fieldName, 'tenantsLength', () => {
      enforce((values as unknown[]).length).greaterThan(0);
    });
  });
  
  omitWhen(!Array.isArray(values), () => {
    (values as unknown[]).forEach(values => {
      test(fieldName, 'notString', () => {
        enforce(values).isString();
      });
    });
    test(fieldName, 'missingRequiredValue', () => {
      const hasRequired = requiredValues.some(required => 
        (values as string[]).includes(required)
      );
      enforce(hasRequired).isTruthy();
    });
  });
}

export function dateValidations(fieldName: string, date: unknown) {

  stringValidations(fieldName, date, STORE_DATE_LENGTH, STORE_DATE_LENGTH);

  omitWhen(date === '', () => {
    test(fieldName, 'invalidDate', () => {
      enforce(checkDate(fieldName, date as string, DateFormat.StoreDate, 1850, 2100, false)).isTruthy();
    });
  });
}

export function timeValidations(fieldName: string, timeValue: unknown) {

  stringValidations(fieldName, timeValue, 5, TIME_LENGTH);

  omitWhen(timeValue === '', () => {
    test(fieldName, 'invalidTime', () => {
      enforce(checkTime(timeValue as string)).isTruthy();
    });
  });
}

export function extractMinutes(timeValue: string): number {
  const time = timeValue.split(':');
  const hours = parseInt(time[0], 10);
  const minutes = parseInt(time[1], 10);
  return hours * 60 + minutes;
}

export function checkTime(timeValue: string): boolean {
  const time = timeValue.split(':');
  if (time.length !== 2) {
    return false;
  }
  const hours = parseInt(time[0], 10);
  const minutes = parseInt(time[1], 10);
  if (isNaN(hours) || isNaN(minutes)) {
    return false;
  }
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return false;
  }
  return true;
}

export function dateTimeValidations(fieldName: string, date: unknown) {

  stringValidations(fieldName, date, STORE_DATETIME_LENGTH, STORE_DATETIME_LENGTH);

  omitWhen(date === '', () => {
    test(fieldName, 'invalidDateTime', () => {
      enforce(checkDate(fieldName, date as string, DateFormat.StoreDateTime, 1850, 2100, false)).isTruthy();
    });
  });
}

export function numberValidations(fieldName: string, value: unknown, isInteger = true, min = 0, max?: number) {
  test(fieldName, 'notNull', () => {
    enforce(value).isNotNull();
  });
  test(fieldName, 'notUndefined', () => {
    enforce(value).isNotUndefined();
  });
  test(fieldName, 'notNumber', () => {
    enforce(value).isNumber();
  });
  omitWhen(isInteger === false, () => {
    test(fieldName, 'notInteger', () => {
      enforce(Number.isInteger(Number(value))).isTruthy();
    });
  });
  test(fieldName, 'tooSmall', () => {
    enforce(value).greaterThanOrEquals(min);
  });
  omitWhen(max === undefined, () => {
    test(fieldName, 'tooLarge', () => {
      enforce(value).lessThanOrEquals(max);
    });
  });
}

export function stringValidations(fieldName: string, value: unknown, maxLength?: number, minLength = 0, isMandatory = false): void {
  test(fieldName, 'notNull', () => {
    enforce(value).isNotNull();
  });
  test(fieldName, 'notUndefined', () => {
    enforce(value).isNotUndefined();
  });
  test(fieldName, 'notString', () => {
    enforce(value).isString();
  });
  omitWhen(isMandatory === false, () => {
    test(fieldName, 'required', () => {
      enforce(value as string).isNotBlank();
    });
  });
  omitWhen(maxLength === undefined || isMandatory === false, () => {
    test(fieldName, 'tooLong', () => {
      enforce(value as string).shorterThanOrEquals(maxLength);
    });
  });
  omitWhen(minLength === undefined || isMandatory === false, () => {
    test(fieldName, 'tooShort', () => {
      enforce(value as string).longerThanOrEquals(minLength);
    });
  });
}

export function tenantValidations(tenants: unknown, givenTenants: string) {
  stringArrayContainsValidation('tenants', tenants, givenTenants.split(','));
  stringArrayValidations('tenants', tenants, givenTenants.split(','));
  test('tenants', 'tenantsType', () => {
    enforce(isArrayOfStrings(tenants)).isTruthy();
  });

  test('tenants', 'tenantsLength', () => {
    enforce((tenants as string[]).length).greaterThan(0);
  });

  const _tenants = tenants as string[];
  const _givenTenants = givenTenants.split(',');
  _tenants.forEach((tenant) => {
    test('tenants', 'tenantValid', () => {
      enforce(tenant).inside(_givenTenants);
    });
  });
}

export function tagValidations(fieldName: string, tags: unknown, givenTags: string) {
  stringValidations(fieldName, tags, LONG_NAME_LENGTH);
  const tagsArray = typeof tags === 'string' ? tags.split(',').filter(t => t.length > 0) : [];
  stringArrayValidations(fieldName, tagsArray, givenTags.split(','));
}

export function urlValidations(fieldName: string, url: unknown) {
  stringValidations(fieldName, url, URL_LENGTH);

  omitWhen(url === '', () => {
    test(fieldName, 'urlStart', () => {
      const _url = url as string;
      enforce(_url.startsWith('https://') || _url.startsWith('assets') || _url.startsWith('tenant') || _url.startsWith('/')).isTruthy();
    });
  });
}
```

- [ ] **Step 2: Type-check shared-util-core**

```bash
npx tsc --noEmit -p libs/shared/util-core/tsconfig.json
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add libs/shared/util-core/src/lib/vest.util.ts
git commit -m "refactor(vest-util): use bare semantic codes in all test() calls — remove i18n knowledge"
```

---

## Task 3: Update shared/util-core translation keys

**Files:**
- Modify: `libs/shared/util-core/src/i18n/de.json`

Replace the existing file entirely. Old keys (`tenantsLength`, `urlStart`, etc.) stay but are now reached via bare codes. Dynamic per-field keys like `nameNotNull` no longer exist.

- [ ] **Step 1: Replace de.json**

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

- [ ] **Step 2: Commit**

```bash
git add libs/shared/util-core/src/i18n/de.json
git commit -m "feat(i18n): replace dynamic per-field validation keys with generic semantic codes"
```

---

## Task 4: Fix address.validations.ts — 9 bare codes → @address.*

**Files:**
- Modify: `libs/subject/address/util/src/lib/address.validations.ts`
- Modify: `libs/subject/address/util/src/i18n/de.json`

- [ ] **Step 1: Update address.validations.ts**

Replace only the cross-validation section (from `// cross validations` to end of file). Top imports and `baseValidations`/`stringValidations` calls are unchanged.

```ts
  // cross validations
  omitWhen(model.addressChannel !== 'custom', () => {
    test('addressChannelLabel', '@address.customChannelLabelMandatory', () => {
      enforce(model.addressChannelLabel).isNotEmpty();
    })
  });
  omitWhen(model.addressUsage !== 'custom', () => {
    test('addressUsageLabel', '@address.customUsageLabelMandatory', () => {
      enforce(model.addressUsageLabel).isNotEmpty();
    })
  });

  omitWhen(model.addressChannel !== 'postal', () => {
    test('zipCode', '@address.zipCodeMandatory', () => {
      enforce(model.zipCode).isNotEmpty();
    });
    test('city', '@address.cityMandatory', () => {
      enforce(model.city).isNotEmpty();
    });
    test('countryCode', '@address.countryMandatory', () => {
      enforce(model.countryCode).isNotEmpty();
    });
    test('countryCode', '@address.countryUppercase', () => {
      enforce(model.countryCode).equals(model.countryCode.toUpperCase());
    });
    test('countryCode', '@address.countryLength', () => {
      enforce(model.countryCode.length).equals(2);
    });
    omitWhen(model.countryCode !== 'CH', () => {
      test('zipCode', '@address.swissZipCodeNumeric', () => {
        enforce(model.zipCode).isNumeric();
      });
      test('zipCode', '@address.swissZipCodeLength', () => {
        enforce(model.zipCode.length).equals(4);
      })
    });
  });
});

// tbd: check that only one address is favorite per type (phone, email, postal)
```

- [ ] **Step 2: Merge new keys into address de.json**

The existing file already has `copy.conf` and `validation.validIban`. Add the `address` namespace:

```json
{
  "copy": {
    "conf": "Die Adresse wurde kopiert."
  },
  "validation": {
    "validIban": "Die IBAN muss ein gültiges Format haben."
  },
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

- [ ] **Step 3: Type-check address-util**

```bash
npx tsc --noEmit -p libs/subject/address/util/tsconfig.json
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add libs/subject/address/util/src/lib/address.validations.ts libs/subject/address/util/src/i18n/de.json
git commit -m "refactor(address): use @address.* i18n keys for cross-field validation messages"
```

---

## Task 5: Fix scs-member-fee.validations.ts — English codes → generic bare codes

**Files:**
- Modify: `libs/relationship/membership/util/src/lib/scs-member-fee.validations.ts`

All nine checks are `greaterThanOrEquals(0)` → `tooSmall`, and `isNotEmpty` → `required`. These map to the generic codes already defined in `shared/util-core/src/i18n/de.json`.

- [ ] **Step 1: Update scs-member-fee.validations.ts**

```ts
import { enforce, only, staticSuite, test } from 'vest';

import { ScsMemberFeesModel } from '@bk2/shared-models';
import { baseValidations, numberValidations } from '@bk2/shared-util-core';

export const scsMemberFeeValidations = staticSuite((model: ScsMemberFeesModel, tenants: string, tags: string, field?: string) => {
  if (field) only(field);

  baseValidations(model, tenants, tags, field);

  test('jb', 'tooSmall', () => { enforce(model.jb).greaterThanOrEquals(0); });
  test('srv', 'tooSmall', () => { enforce(model.srv).greaterThanOrEquals(0); });
  test('bev', 'tooSmall', () => { enforce(model.bev).greaterThanOrEquals(0); });
  test('entryFee', 'tooSmall', () => { enforce(model.entryFee).greaterThanOrEquals(0); });
  test('locker', 'tooSmall', () => { enforce(model.locker).greaterThanOrEquals(0); });
  test('hallenTraining', 'tooSmall', () => { enforce(model.hallenTraining).greaterThanOrEquals(0); });
  test('skiff', 'tooSmall', () => { enforce(model.skiff).greaterThanOrEquals(0); });
  test('skiffInsurance', 'tooSmall', () => { enforce(model.skiffInsurance).greaterThanOrEquals(0); });

  numberValidations('rebate', model.rebate, false, 0);

  test('state', 'required', () => { enforce(model.state).isNotEmpty(); });
});
```

- [ ] **Step 2: Type-check membership-util**

```bash
npx tsc --noEmit -p libs/relationship/membership/util/tsconfig.json
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add libs/relationship/membership/util/src/lib/scs-member-fee.validations.ts
git commit -m "refactor(membership): replace English validation codes with generic bare codes"
```

---

## Task 6: Fix menu-item.validations.ts + create menu de.json

**Files:**
- Modify: `libs/cms/menu/util/src/lib/menu-item.validations.ts`
- Create: `libs/cms/menu/util/src/i18n/de.json`

- [ ] **Step 1: Update menu-item.validations.ts**

Replace only line 39 (`menuItemsType` → `@menu.itemsType`):

```ts
  omitWhen(model.menuItems === undefined, () => {
    test('menuItems', '@menu.itemsType', () => {
      enforce(isArrayOfStrings(model.menuItems)).isTruthy();
    });
  });
```

- [ ] **Step 2: Create libs/cms/menu/util/src/i18n/de.json**

```json
{
  "menu": {
    "itemsType": "Menüeinträge müssen eine Liste sein."
  }
}
```

- [ ] **Step 3: Type-check cms-menu-util**

```bash
npx tsc --noEmit -p libs/cms/menu/util/tsconfig.json
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add libs/cms/menu/util/src/lib/menu-item.validations.ts libs/cms/menu/util/src/i18n/de.json
git commit -m "refactor(menu): use @menu.itemsType i18n key for menu items validation"
```

---

## Task 7: Fix responsibility-section.validations.ts

**Files:**
- Modify: `libs/cms/section/ui/src/lib/responsibility-section.validations.ts`

Change `'validation.required'` (a string that was neither bare nor `@`-prefixed) to the bare code `'required'`. ErrorNote will resolve it to `validation.required` via the new dispatch rule.

- [ ] **Step 1: Update responsibility-section.validations.ts**

```ts
import { create, enforce, test } from 'vest';

import { ResponsibilityConfig } from '@bk2/shared-models';

export const responsibilitySectionValidations = create((data: ResponsibilityConfig) => {
  test('bkey', 'required', () => {
    enforce(data.bkey).isNotEmpty();
  });
});
```

- [ ] **Step 2: Type-check cms-section-ui**

```bash
npx tsc --noEmit -p libs/cms/section/ui/tsconfig.json
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add libs/cms/section/ui/src/lib/responsibility-section.validations.ts
git commit -m "refactor(cms-section): use bare 'required' code in responsibility validation"
```

---

## Task 8: Full type-check and run tests

**Files:** none — verification only.

- [ ] **Step 1: Type-check all changed libs together**

```bash
npx tsc --noEmit -p libs/shared/ui/tsconfig.json && \
npx tsc --noEmit -p libs/shared/util-core/tsconfig.json && \
npx tsc --noEmit -p libs/subject/address/util/tsconfig.json && \
npx tsc --noEmit -p libs/relationship/membership/util/tsconfig.json && \
npx tsc --noEmit -p libs/cms/menu/util/tsconfig.json && \
npx tsc --noEmit -p libs/cms/section/ui/tsconfig.json
```

Expected: all pass with no errors.

- [ ] **Step 2: Run tests for affected libs**

```bash
pnpm run test shared-util-core
pnpm run test shared-ui
```

Expected: all tests pass. (No new test files needed — the refactor changes string literals only, not logic. Existing specs that test validation error codes should still pass since vest error identity is based on field name, not message string.)

- [ ] **Step 3: Verify no domain-specific bare codes remain**

```bash
grep -rn "test(" libs --include="*.validations.ts" | grep -v ", '@" | grep -v ", \`@" | grep -v "^--" | grep "test(" | grep -v "//\s*test"
```

Expected: only these two files appear, both using intentional generic bare codes (`tooSmall`, `required`) which are correct:
- `scs-member-fee.validations.ts` — `tooSmall` and `required`
- `responsibility-section.validations.ts` — `required`

Any other file appearing is a bug — investigate and fix.

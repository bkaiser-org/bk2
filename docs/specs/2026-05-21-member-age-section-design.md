# MemberAgeSection Design

## Overview

Add a new `member-age` section type to `cms/section` that reads all active members of a configured organisation and renders an age-distribution table with columns **Altersgruppe / Männer / Frauen / Total** and one row per decade plus a Total row.

---

## 1. Data Model (`shared-models`)

### New types in `section.model.ts`

```ts
export interface MemberAgeSection extends BaseSection {
  type: 'member-age';
  properties: MemberAgeConfig;
}

export interface MemberAgeConfig {
  orgId: string; // orgKey of the org whose active members are counted
}
```

**`SectionType`** gains `'member-age'`.  
**`SectionModel`** union gains `MemberAgeSection`.  
**`BaseSection.properties`** union gains `MemberAgeConfig`.

### New shape in `section.shapes.ts`

```ts
export const MEMBER_AGE_CONFIG_SHAPE: MemberAgeConfig = { orgId: '' };
export const MEMBER_AGE_SECTION_SHAPE = {
  ...BASE_SECTION_SHAPE,
  type: 'member-age',
  properties: MEMBER_AGE_CONFIG_SHAPE,
};
```

---

## 2. Store (`libs/cms/section/feature/src/lib/member-age-section.store.ts`)

### State

```ts
type MemberAgeSectionState = { orgId: string };
const initialState: MemberAgeSectionState = { orgId: '' };
```

### Data loading

`rxResource` calls `MembershipService.listMembersOfOrg(orgId)` and filters to active memberships:

```
relIsLast === true  AND  dateOfExit > today (YYYYMMDD string comparison)
```

Members with a missing or invalid `memberDateOfBirth` are silently excluded from the table.

### Age row type

```ts
type AgeRow = { label: string; male: number; female: number; total: number };
```

### Computed rows

Ten decade buckets plus a Total row:

| label  | condition           |
|--------|---------------------|
| `< 20` | age < 20            |
| `21–30`| 21 ≤ age ≤ 30       |
| `31–40`| 31 ≤ age ≤ 40       |
| `41–50`| 41 ≤ age ≤ 50       |
| `51–60`| 51 ≤ age ≤ 60       |
| `61–70`| 61 ≤ age ≤ 70       |
| `71–80`| 71 ≤ age ≤ 80       |
| `81–90`| 81 ≤ age ≤ 90       |
| `> 90` | age > 90            |
| Total  | sum of all buckets  |

Age = current year − birth year, adjusted if birthday has not yet occurred this year (using month/day from the `YYYYMMDD` string).

Gender is read from `membership.memberType` (`'male'` | `'female'`).

### Public API

| Member | Type | Description |
|--------|------|-------------|
| `rows` | `Signal<AgeRow[]>` | 9 decade rows + Total |
| `isLoading` | `Signal<boolean>` | loading state |
| `setConfig(config)` | `void` | called from component effect |
| `i18n` | translated signals | column headers + empty message |

---

## 3. Component (`libs/cms/section/feature/src/lib/member-age-section.ts`)

- **Selector**: `bk-member-age-section`
- **Inputs**: `section: input<MemberAgeSection>()`, `editMode: input<boolean>(false)`
- **Providers**: `[MemberAgeSectionStore]`
- **Constructor effect**: `store.setConfig(section()?.properties)`

Template structure (ion-grid):

```
| Altersgruppe | Männer | Frauen | Total |   ← header, store.i18n.*
|  < 20        |      3 |      2 |     5 |   ← @for rows, bold on last (Total)
|  ...
|  Total       |     42 |     31 |    73 |
```

- Shows `<bk-spinner />` while `store.isLoading()` is true
- Shows `<bk-empty-list />` when all decade row totals are 0

---

## 4. Integration

| File | Change |
|------|--------|
| `section-dispatcher.ts` | Add `@case('member-age')`, import component |
| `section.model.ts` | `SectionType`, `SectionModel`, `BaseSection.properties` unions |
| `section.shapes.ts` | `MEMBER_AGE_CONFIG_SHAPE`, `MEMBER_AGE_SECTION_SHAPE` |
| `cms/section/feature/src/index.ts` | Export `MemberAgeSectionComponent` |

---

## 5. i18n

File: `libs/cms/section/feature/src/i18n/de.json`

```json
"memberAge": {
  "ageGroup": "Altersgruppe",
  "male": "Männer",
  "female": "Frauen",
  "total": "Total",
  "empty": "Keine aktiven Mitglieder gefunden."
}
```

---

## Out of scope

- Section configuration UI (edit modal / form field for `orgId`) — follow-up task
- Members with unknown gender (not `'male'` or `'female'`) are excluded silently
- Export / print formatting

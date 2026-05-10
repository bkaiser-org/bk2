# Quick-Entry Triggers Design

**Date:** 2026-05-10
**Scope:** CalEvent quick-entry (`calevent-list.component.ts`) — `@` person trigger and `//` date+time trigger. `!!` location trigger is deferred.

---

## Overview

Enhance the quick-entry textarea in `calevent-list` with two inline triggers:

| Trigger | Action | Inserted token |
|---------|--------|----------------|
| `@` | Opens person-select modal | `@Full Name` |
| `//` | Opens date+time picker modal | `dd.mm.yyyy` or `dd.mm.yyyy,HHmm` |

Users type freely. Typing a trigger character immediately opens the appropriate modal. The modal result replaces the trigger in the textarea. On save, tokens are parsed and mapped to `CalEventModel` fields.

The old structured format `[date],[time]:[name],[location]//[type]` is dropped entirely. The `type` field is removed from quick entry.

---

## UX Flow

**What the user types → what gets inserted:**

| User types | Modal opens | Modal inserts | Final textarea |
|---|---|---|---|
| `Team Meeting //` | date+time picker | `30.01.2026` | `Team Meeting 30.01.2026` |
| `Team Meeting //` | date+time picker | `30.01.2026,1830` | `Team Meeting 30.01.2026,1830` |
| `Team Meeting @` | person select | `@Maria Muster` | `Team Meeting @Maria Muster` |
| `Team Meeting @ //` | both | both | `Team Meeting @Maria Muster 30.01.2026,1830` |

- Only one person can be added per quick entry.
- Tokens can appear in any order in the textarea.
- Users never manually type date/time tokens — they are always modal-produced.
- Date-only → `fullDay = true`, `durationMinutes = 1440`.
- Date+time → `fullDay = false`, `durationMinutes = 60` (default).

---

## Architecture

Three parts:

1. **`QuickEntryService`** — new, in `libs/shared/util-angular/src/lib/quick-entry.service.ts`
2. **`calevent-list.component.ts`** — modified: adds `ionInput` handler and updates `quickEntry()` save method
3. **`parseEventString()` in `shared/util-core/src/lib/type.util.ts`** — modified: remove `//type` split, remove `type` from return type

`QuickEntryService` lives in `shared/util-angular` so it can be reused by tasks and other features in the future.

---

## QuickEntryService

**File:** `libs/shared/util-angular/src/lib/quick-entry.service.ts`

```ts
detectTrigger(text: string): 'person' | 'date' | null
```
Returns `'person'` if text ends with `@`, `'date'` if ends with `//`, `null` otherwise.

```ts
replaceToken(text: string, trigger: '@' | '//', replacement: string): string
```
Replaces the last occurrence of the trigger character(s) with the replacement string.

- `replaceToken('Meeting @', '@', '@Maria Muster')` → `'Meeting @Maria Muster'`
- `replaceToken('Meeting //', '//', '30.01.2026,1830')` → `'Meeting 30.01.2026,1830'`

```ts
parseTokens(text: string): { name: string; personName: string | null; startDate: string | null; startTime: string | null }
```
Extracts tokens from the final textarea value:

- `/@([^\d@][^@]*)/` → `personName` (full name after `@`)
- `/\b(\d{2}\.\d{2}\.\d{4})(?:,(\d{4}))?\b/` → `startDate` (YYYYMMDD) + optional `startTime` (HHmm)
- Date conversion uses `convertDateFormatToString` / `DateFormat` from `@bk2/shared-util-core`
- Remaining text with both tokens stripped and trimmed → `name`

Unit tests in `quick-entry.service.spec.ts` cover all three methods including edge cases (no tokens, both tokens, tokens in different orders).

---

## calevent-list.component.ts Changes

### New state

```ts
private selectedQuickEntryPerson = signal<PersonModel | null>(null);
```

### New `onQuickEntryInput(event: Event)` handler

Bound to `(ionInput)` on the `IonTextarea`.

1. Get current textarea value.
2. Call `quickEntryService.detectTrigger(value)`.
3. If `'person'` → open `PersonSelectModal` (existing, in `@bk2/shared-feature`). On confirm:
   - Call `quickEntryService.replaceToken(value, '@', '@{person.name}')`.
   - `selectedQuickEntryPerson.set(person)`.
   - Write updated value back to `textarea.nativeElement.value`.
4. If `'date'` → open `DateTimeSelectModal` (new, see below). On confirm:
   - Format result as `dd.mm.yyyy` or `dd.mm.yyyy,HHmm`.
   - Call `quickEntryService.replaceToken(value, '//', formattedDateTime)`.
   - Write updated value back to `textarea.nativeElement.value`.

### Modified `quickEntry()` save method

1. Call `quickEntryService.parseTokens(inputText)`.
2. Set `calevent.name` from `parsedTokens.name`.
3. If `parsedTokens.startDate`:
   - Set `calevent.startDate`.
   - If `parsedTokens.startTime`: set `calevent.startTime`, `fullDay = false`, `durationMinutes = 60`.
   - Else: `calevent.fullDay = true`, `durationMinutes = 1440`.
4. If `selectedQuickEntryPerson()`:
   - Build `AvatarInfo` from the `PersonModel` (same pattern as existing `selectPerson()` in the edit form).
   - Push to `calevent.responsiblePersons`.
5. Reset: `selectedQuickEntryPerson.set(null)`.

---

## DateTimeSelectModal

**File:** `libs/shared/ui/src/lib/date-time-select.modal.ts`

A new lightweight modal wrapping `ion-datetime` with `presentation="date-time"`. Returns via `modalController.dismiss(isoDateTimeString, 'confirm')` where `isoDateTimeString` is an ISO 8601 datetime string (e.g., `2026-01-30T18:30:00`). The caller formats this to `dd.mm.yyyy,HHmm`.

Pattern follows the existing `DateSelectModal` (`date-select.modal.ts`).

Inputs:
```ts
public isoDateTime = input(new Date().toISOString());
public headerTitle = input('@general.operation.select.date');
```

---

## parseEventString Changes

**File:** `libs/shared/util-core/src/lib/type.util.ts`

- Remove: split on `//` to extract `type`.
- Remove: `type` from return type.
- Remove: split on `:` for the old date/time prefix — the old structured format is dropped entirely.
- Delegate token extraction to `QuickEntryService.parseTokens()`.

Updated return type:
```ts
{ startDate: string; startTime: string; name: string; location: string }
```

All callers of `parseEventString` that read the `type` field must be updated to remove that reference.

---

## Files Changed / Created

| File | Change |
|------|--------|
| `libs/shared/util-angular/src/lib/quick-entry.service.ts` | **New** |
| `libs/shared/util-angular/src/lib/quick-entry.service.spec.ts` | **New** |
| `libs/shared/ui/src/lib/date-time-select.modal.ts` | **New** |
| `libs/calevent/feature/src/lib/calevent-list.component.ts` | Modified |
| `libs/shared/util-core/src/lib/type.util.ts` | Modified (`parseEventString`) |
| `libs/shared/util-angular/src/index.ts` | Export `QuickEntryService` |
| `libs/shared/ui/src/index.ts` | Export `DateTimeSelectModal` |

---

## Out of Scope

- `!!` location trigger — deferred to a separate spec (requires `LocationModel`, `locations` Firestore collection, and a location-select map modal).
- Task quick entry — `QuickEntryService` is designed to support this but the task integration is a separate feature.

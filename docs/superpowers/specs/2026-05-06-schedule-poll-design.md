# Schedule Poll Feature Design

**Date:** 2026-05-06
**Status:** Approved

## Overview

A "find a common date" scheduling feature for group calendars, similar to xoyondo.com. The author proposes a set of dates; group members accept or decline each one; the author closes the poll by selecting one final date. No new Firestore collection is needed — the feature is built entirely on top of the existing `CalEventModel` and invitation infrastructure.

---

## Scope

- Only available in group calendars (`calendar.owner` starts with `'group.'`)
- Targets the members of that group (via existing invitation model)
- Author = the user who starts the schedule poll
- Close action is restricted to the author and privileged users

Out of scope: public/open-event scheduling, external participants, recurring schedules.

---

## 1. Data Model

### 1.1 `CalEventModel` — one new field

```typescript
state: 'proposed' | 'provisional' | 'definitive'   // default: 'definitive'
```

- `definitive` — all existing events; default so no migration is needed
- `provisional` — pre-existing use case for manually-added tentative dates (unrelated to this feature)
- `proposed` — set on every date created by the schedule poll flow

All other fields are reused as-is:

| Field | Role in scheduling |
|---|---|
| `name` | Schedule topic / title |
| `description` | Optional description shown to members |
| `seriesId` | Groups all proposed dates of one poll |
| `responsiblePersons[0]` | Author / poll owner |
| `isOpen` | Always `false` for schedule dates (invitation-based) |
| `calendars` | The group calendar key |
| `startDate` / `startTime` / `fullDay` | The individual proposed date |

### 1.2 Identifying an active schedule poll

A series is an active schedule poll when:
1. Events share a `seriesId` (non-empty)
2. At least one event in the series has `state === 'proposed'`
3. `isOpen === false`

No new collection, no new flag on the calendar.

### 1.3 Invitation / response model

Schedule dates use `isOpen=false`, so responses are stored in the **invitations collection** (one invitation document per member per proposed date). Each invitation has a `state: 'invited' | 'accepted' | 'declined'`. The existing `subscribe` / `unsubscribe` / `changeInvitationState` methods handle all response writes without modification. (`attendees[]` on `CalEventModel` is only used for `isOpen=true` events and is not involved here.)

---

## 2. New Components

All files live in `libs/calevent/feature/src/lib/`.

### 2.1 `schedule-new.modal.ts`

Standalone Ionic modal opened by `store.schedule()`.

**Fields:**
- `name` (required) — maps to `CalEventModel.name`
- `description` (optional) — maps to `CalEventModel.description`
- Proposed dates list: shown as chips; tapping `+ Termin` opens an **inline monthly calendar** with multi-day selection (tap to toggle individual days, navigate months with ‹ ›, confirm with "N Tage übernehmen")

**Actions:**
- `Entwurf` (secondary) — dismisses without saving (future: could persist a draft, out of scope for now)
- `Mitglieder einladen →` (primary) — dismisses and returns `{ name, description, dates: Date[] }` to the store

The store then:
1. Creates one `CalEventModel` per selected date (`state: 'proposed'`, `isOpen: false`, shared `seriesId`, `calendars: [groupCalendarKey]`)
2. Calls `inviteGroupMembers` on **each** proposed event — members receive one invitation per proposed date, allowing them to respond independently per date

### 2.2 `schedule-table.modal.ts`

Standalone Ionic modal opened from the action sheet via "Abstimmung anzeigen".

**Input:** `seriesId: string`

**Data loading:** Reads all proposed events with matching `seriesId` from the store; reads all invitations for those events to get member responses.

**Layout (Xoyondo-style table):**
- Rows = invited group members (avatar + full name; current user's row highlighted)
- Columns = proposed dates (day + short date, e.g. "Sa 22.6")
- Cells = ✓ (accepted) / ✗ (declined) / ? (maybe / no response yet) — current user's cells are tappable and call `changeInvitationState`
- Count row at bottom: number of acceptances per date; best date marked with ★

---

## 3. Store Operations (`calevent.store.ts`)

### 3.1 `schedule(startDate?: string)`

- Only callable when `isGroupCalendar` is true
- Opens `ScheduleNewModal`
- On modal result: generates a shared `seriesId` (same format as existing series IDs), batch-creates one `CalEventModel` per date with `state: 'proposed'`, calls `inviteGroupMembers` on the series

### 3.2 `closeSchedule(selectedEvent: CalEventModel, message?: string)`

1. **Firestore batch:**
   - **UPDATE** selected event: `state → 'definitive'`, `seriesId → ''` (decouples from series so it lives on as a standalone event)
   - **ARCHIVE** all other events in the same `seriesId` with `state === 'proposed'`: set `isArchived → true`
2. **After batch resolves:** send Matrix message to group room (async, outside the batch — see §7)

### 3.3 `onPopoverDismiss` extension (`calevent-list.component.ts`)

```typescript
case 'schedule':
  this.store.schedule();
  break;
```

The `'schedule'` menu item is added to the `c-calevents` menu configuration and is only visible when `isGroupCalendar` is true (controlled via menu visibility rules).

---

## 4. Calendar Color Coding

In `calevent-list.component.ts`, the FullCalendar `eventClassNames` callback and the list-view item template both add a CSS class based on `calEvent.state`:

| State | CSS class | Visual |
|---|---|---|
| `proposed` | `state-proposed` | Blue background / left border (`#3d5a80`) |
| `provisional` | `state-provisional` | Yellow/amber left border |
| `definitive` | (none / default) | Default event colour |

Acceptance counter on proposed dates in the grid view: displayed as a small badge `4/6` (acceptances / total invited), derived from invitation data. The date with the most acceptances gets a ★ suffix.

---

## 5. Member Response Flow

When any group member taps a proposed date in the calendar:

1. The standard action sheet opens (same as for any calevent with `isOpen=false`)
2. Options shown to all members: "Zusagen" / "Absagen" (maps to existing `subscribe` / `unsubscribe`)
3. Additional option for all: "Abstimmung anzeigen" → opens `ScheduleTableModal`
4. Additional option for **author and privileged users only**: "Diesen Termin wählen & Abstimmung schliessen" → triggers §6

---

## 6. Close Poll Flow

1. Author taps a proposed date → action sheet → "Diesen Termin wählen & Abstimmung schliessen"
2. Confirmation alert with:
   - Summary: "Sa, 22. Juni 2025 wird als definitiver Termin gewählt. Alle anderen Vorschläge werden entfernt."
   - Optional message text field
   - Cancel / Bestätigen buttons
3. On confirm: `store.closeSchedule(event, message)` executes the batch (§3.2)
4. Calendar refreshes: selected date changes to default colour (`definitive`), all other proposed dates disappear (`isArchived`)
5. The confirmed event retains its invitation responses so the attendee list is still visible

---

## 7. Matrix Chat Notification

On `closeSchedule`, a Matrix message is sent to the group room associated with the group calendar. Message format:

```
✅ {event.name}
Termin: {formatted date, e.g. "Samstag, 22. Juni 2025"}
{optional author message}
```

Sent via the existing Matrix integration in the store (same mechanism used elsewhere for group notifications). The group room ID is derived from `groupCalendarId` (already available as a computed signal on the store).

---

## 8. Authorization

| Action | Who |
|---|---|
| Start schedule poll | `eventAdmin`, `privileged`, `groupAdmin`, author |
| Respond (accept/decline) | Any invited group member |
| View schedule table | Any invited group member |
| Close poll / select date | Author (`responsiblePersons[0]`) or `privileged` user |

Uses existing `canChange` / `hasRole` helpers — no new authorization primitives needed.

---

## 9. File Changes Summary

| File | Change |
|---|---|
| `libs/shared/models/src/lib/calEvent.model.ts` | Add `state` field |
| `libs/calevent/feature/src/lib/calevent.store.ts` | Add `schedule()`, `closeSchedule()` |
| `libs/calevent/feature/src/lib/calevent-list.component.ts` | Handle `'schedule'` in `onPopoverDismiss`; add `state`-based CSS classes; show acceptance badge on proposed dates; show close-poll option in action sheet |
| `libs/calevent/feature/src/lib/schedule-new.modal.ts` | **New** — create schedule modal |
| `libs/calevent/feature/src/lib/schedule-table.modal.ts` | **New** — Xoyondo-style response table |
| Menu config for `c-calevents` | Add `schedule` menu item (group calendar only) |

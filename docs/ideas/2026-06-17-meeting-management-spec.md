# Idea: Meeting Management (Agenda, Attendees, Minutes)

**Date:** 2026-06-17
**Status:** Idea — stub, to be elaborated
**Origin:** New.

## Problem / goal

Manage meetings end-to-end: an **agenda** before, an **attendee** list (present/excused/absent),
and **minutes** (decisions + action items) after — linked to members and producing follow-up tasks.

## Initial scope (to refine)

- `MeetingModel` (date, location, type, linked org/group).
- Agenda items (ordered, with owner + time box).
- Attendees from `persons` (RSVP / present / excused).
- Minutes per agenda item; decisions; action items → tasks with responsible + due date.
- PDF export of the minutes (reuse document generation).

## Open questions

- Relationship to `calevent` (a meeting is a calendar event with extra structure?).
- Recurring meeting series; carry-over of open action items.

## Dependencies

- `person`, `task`, calendar (`calevent`), document generation (PDF).

---
name: creating-help-videos
description: Use when creating or updating a step-by-step help/tutorial/onboarding/explainer video for end users (e.g. login, password reset, registration, how to use a feature) — covers the German storyboard + Sprechertext + screenshot-capture guide produced per tenant/topic for desktop and mobile.
---

# Creating Help Videos

## Overview

A **help video** is NOT a rendered video file. The deliverable is a set of plain
files that a human (or a video tool) assembles into a screencast/slideshow:

- **`script.md`** per platform — storyboard table + German Sprechertext.
- **`assets/`** per platform — manually captured PNG screenshots.
- **`CAPTURE-GUIDE.md`** per topic — exactly which screenshots to take.

Updating a video later = replace screenshots (same filenames) or edit the markdown.
No build step.

## When to use

- "Create a help/tutorial/onboarding/explainer video for X" (login, password reset, …).
- Refreshing an existing video's screenshots or narration.
- Same topic for another tenant, or adding the desktop/mobile counterpart.

## File structure (one canonical layout)

```
docs/documentation/videos/
  <tenant>/                 e.g. scs
    <topic>/                e.g. login
      CAPTURE-GUIDE.md       shared shot list (App Check note, window-size tips)
      desktop/
        script.md            Win/Mac/Linux narration + storyboard
        assets/              01-*.png … (manual)
      mobile/
        script.md            iOS/Android narration + storyboard
        assets/              01-*.png … (manual)
```

This lets the same topic exist per tenant, and per platform, independently.

## Workflow

1. **Gather inputs** (ask the user, one batch via the question tool):
   tenant id · website URL · app URL · topic slug · platforms (desktop/mobile/both) ·
   a short description of the flow the video must cover · audience/language
   (default: German, IT-novice). Ask for any other info you need for accuracy.
2. **Get the REAL labels from the app — do not guess.** Read the feature's
   `i18n/de.json` and the route paths (e.g. `apps/<app>/src/app/app.routes.ts`,
   the feature's `*.page.ts`). Use the exact button/field/title strings in the
   narration. (See the `i18n` skill for where keys live.)
3. **Scaffold:** `bash .claude/skills/creating-help-videos/scaffold.sh <tenant> <topic> both`
   — creates the folders + `script.md` skeletons from `script-template.md`.
4. **Write each `script.md`:** identical Sprechertext across desktop & mobile;
   only the *Plattform-Hinweis* column and screenshots differ. Cover Intro →
   ordered parts → Outro. For first-time flows, keep the original video's order
   but add a one-line note pointing first-timers to the password-setting part.
5. **Write `CAPTURE-GUIDE.md`** at the topic level: one numbered shot per row
   (filename · URL/where · required state). Mark screenshots you cannot capture
   (e.g. an email) as `PLATZHALTER` and say the user supplies them.
6. **Screenshots are captured manually by the user** (see gotcha below). Optionally
   capture *public* form screens with Playwright as `_reference/` examples only.

## Gotchas (learned, save the user pain)

- **App Check blocks automated capture.** The production app is behind Firebase
  App Check; a headless browser fails it → Firestore returns `403 / Missing
  permissions`, so no real login, no logged-in screens, and the reset link comes
  by real email anyway. **Recommend the user captures screenshots in their normal,
  logged-in browser.** A debug-token exception is possible but weakens production
  App Check and still can't produce the email screens — don't default to it.
- **Clean desktop framing:** tell the user NOT to maximize the window. At ≳950 px
  the app shows a left split-pane menu (with a yellow `Missing: main_<tenant>`
  artifact). A window width of ~800–950 px shows only the clean hamburger ☰.
- **Mobile:** real phone or ~390×844 portrait; keep the on-screen keyboard visible.
- **Balanced bold:** when bolding a quoted label write `**„Anmelden"**` (closing
  `**`), never `**„Anmelden"` — an unbalanced marker bolds the rest of the line.
- **Use real menu labels** (e.g. the WordPress item is „Mitglieder Bereich" with a
  space), not what you assume.

## Files in this skill

- `scaffold.sh` — creates the tenant/topic/platform tree + script skeletons.
- `script-template.md` — the per-platform storyboard skeleton scaffold.sh fills in.

## Worked example

`docs/documentation/videos/scs/login/` is a complete reference: desktop + mobile
`script.md`, a shared `CAPTURE-GUIDE.md`, and `_reference/` example screenshots.
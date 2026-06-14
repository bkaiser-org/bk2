---
name: icons
description: Use when adding, choosing, or rendering an icon in a template — picking an icon name, using ion-icon, the svgIcon pipe, icon sets (icons / filetypes / section / models), or wondering why an icon shows blank. Covers the DB-backed icon repository and how to find a valid icon name.
---

# Icons

## Overview

Icons are **SVG files** stored in Firebase Storage at `logo/<set>/<name>.svg` and tracked as
`IconModel` records in the Firestore **`icons` collection**. The app loads them by URL through
imgix — there are **no icon assets in the repo**, so never grep the code for icon files.

In templates you render an icon with `ion-icon` + the `svgIcon` pipe, which builds the imgix URL.

## The rule

**Always use `ion-icon` with `src` + the `svgIcon` pipe. Never use the `name` attribute.**

```html
<!-- ✅ correct -->
<ion-icon slot="start" src="{{ 'menu' | svgIcon }}" />

<!-- ❌ never — name= uses Ionic's bundled Ionicons, not our DB icon set -->
<ion-icon name="menu" />
```

`svgIcon` ([svg-icon.pipe.ts](../../../libs/shared/pipes/src/lib/svg-icon.pipe.ts)) resolves
`name` → `${imgixBaseUrl}/logo/<set>/<name>.svg`. In TS, use `getSvgIconUrl(imgixBaseUrl, name, set)`
from `@bk2/shared-util-core` (e.g. when building ActionSheet buttons).

## Icon sets

Each `IconModel` has a `type` = the **icon set** (the Storage subfolder). The set is the pipe's
second argument; it defaults to `icons`:

| Set | Purpose | Usage |
|---|---|---|
| `icons` | General-purpose UI icons — **the default, used almost everywhere** | `'edit' \| svgIcon` |
| `filetypes` | File-type icons (pdf, doc, …) | `name \| svgIcon:'filetypes'` |
| `section` | CMS section-type icons | `name \| svgIcon:'section'` |
| `models` | Model-type icons (person, org, resource, …) | `name \| svgIcon:'models'` |
| `general` | Misc / legacy | `name \| svgIcon:'general'` |

(Canonical list: `ICON_SETS` in [icon.store.ts](../../../libs/cms/icon/feature/src/lib/icon.store.ts).)

## Choosing an icon name

Icon names are **data in the `icons` collection** (set `type: 'icons'`), not something you can
infer from the filesystem. To pick one:

1. **Check the generated name list** at [references/icon-names.txt](references/icon-names.txt) if present —
   grep it for a keyword (it also indexes the editable `index` keywords per icon).
2. If the list is missing or stale, regenerate it (see below).
3. **If you can't find a clearly suitable name, ASK the user** rather than guessing — a wrong
   name yields a 404 and the icon renders blank (no error thrown).

Common names already used in code: `add`, `add-circle`, `edit`, `trash`, `copy`, `download`,
`document`, `menu`, `settings`, `archive`, `cancel`, `eye-on`, `email`, `tel`, `location`,
`checkbox-circle`, `chevron-up`, `chevron-down`, `person-add`. Treat this as a hint, not the full set.

## Regenerating the icon-name list

The `references/icon-names.txt` file is a periodically-generated snapshot for fast lookup.
Regenerate it (and commit) when icons feel out of date or a name 404s:

```sh
node .claude/skills/icons/scripts/dump-icon-names.mjs > .claude/skills/icons/references/icon-names.txt
```

The script queries the Firestore `icons` collection (set `type: 'icons'`) and writes
`name — index keywords` per line, with a generation-date header. (See the script for the exact
query; it relies on the Firebase Admin/MCP credentials already configured for this repo.)

## The icon repository UI

Admins manage icons at `/icon/:listId/:contextMenuName` via `IconList` / `IconSelectModal`
(`@bk2/cms-icon-feature`). `IconSelectModal` is the in-app picker (returns the icon `name`);
`sync()` scans Storage and back-fills missing Firestore records. Full domain reference:
[ICON.md](../../../libs/cms/icon/feature/src/lib/ICON.md).

## Common mistakes

- `<ion-icon name="…">` → uses Ionic's bundled set, not our DB icons. Always `src` + `svgIcon`.
- Guessing an icon name → 404 → blank icon, no error. Verify against the name list or ask.
- Searching the repo for `.svg` assets → there are none; icons live in Storage/Firestore.
- Forgetting the set argument for non-default sets (`filetypes`/`section`/`models`).

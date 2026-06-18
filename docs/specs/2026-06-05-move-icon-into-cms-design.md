# Design: Move Icon Feature into CMS Domain

**Date:** 2026-06-05
**Status:** Approved

## Goal

Relocate `libs/icon/` into the CMS domain at `libs/cms/icon/`, rename all TS import aliases to follow the `@bk2/cms-*` convention, and update Transloco scope strings accordingly. No behaviour changes.

## Directory Move

```
libs/icon/data-access/  →  libs/cms/icon/data-access/
libs/icon/feature/      →  libs/cms/icon/feature/
libs/icon/ui/           →  libs/cms/icon/ui/
libs/icon/util/         →  libs/cms/icon/util/
```

Use `git mv` for each layer to preserve file history.

## Alias Renames

### `tsconfig.base.json`

| Old | New |
|---|---|
| `@bk2/icon-data-access` | `@bk2/cms-icon-data-access` |
| `@bk2/icon-feature` | `@bk2/cms-icon-feature` |
| `@bk2/icon-ui` | `@bk2/cms-icon-ui` |
| `@bk2/icon-util` | `@bk2/cms-icon-util` |

### `package.json` in each layer

Each layer's `package.json` `name` field renames from `@bk2/icon-<layer>` to `@bk2/cms-icon-<layer>`.

### Internal cross-references

All `@bk2/icon-*` imports inside the icon libs themselves update to `@bk2/cms-icon-*`.

## Transloco Scope Strings

Updated in `libs/cms/icon/util/src/lib/icon-i18n.ts` and the three `scope.ts` files:

| Old | New |
|---|---|
| `@icon/feature.` | `@cms/icon/feature.` |
| `@icon/data-access.` | `@cms/icon/data-access.` |
| `@icon/util.` | `@cms/icon/util.` |

## Asset Paths (`apps/scs-app/project.json`)

Two entries renamed, one stale entry removed:

| Action | Input path | Output path |
|---|---|---|
| Rename | `libs/icon/data-access/src/i18n` → `libs/cms/icon/data-access/src/i18n` | `./assets/i18n/icon/data-access` → `./assets/i18n/cms/icon/data-access` |
| Rename | `libs/icon/feature/src/i18n` → `libs/cms/icon/feature/src/i18n` | `./assets/i18n/icon/feature` → `./assets/i18n/cms/icon/feature` |
| Remove | `libs/icon/ui/src/i18n` (directory does not exist — stale entry) | — |

## External Consumers

Only two files outside the icon libs reference `@bk2/icon-*`:

1. `apps/scs-app/src/app/app.routes.ts` — static `import('@bk2/icon-feature')` → `import('@bk2/cms-icon-feature')`
2. `libs/cms/menu/feature/src/lib/menu.modal.ts` — dynamic `await import('@bk2/icon-feature')` → `await import('@bk2/cms-icon-feature')`

## Route Path

**Unchanged.** The route `/icon/:listId/:contextMenuName` → `IconList` stays exactly as-is. Only the import alias in `app.routes.ts` changes.

## tsconfig.json References

Each layer's `tsconfig.json` lists `@bk2/*` dependencies as project references (paths). Any references to sibling icon layers update from `libs/icon/<layer>` to `libs/cms/icon/<layer>`.

## Verification

After the move:
1. `npx tsc --noEmit` across affected libs returns 0 errors
2. Dev server serves `assets/i18n/cms/icon/feature/de.json` without 404
3. `/icon` route loads `IconList` correctly

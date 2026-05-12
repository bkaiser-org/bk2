# i18n Per-Module Split — Design Spec

**Date:** 2026-05-12  
**Status:** Approved

## Problem

The app has one monolithic translation file per language (`apps/scs-app/src/assets/i18n/de.json`, ~4,849 leaf keys, ~8,800 lines). Translations are owned by no one, editable only by developers, and require a full redeploy to change any copy.

## Goals

- Split translations into one file per lib layer (`data-access`, `feature`, `ui`, `util`)
- Keep the existing monolithic files unchanged (backward compatibility)
- Store the source of truth in Firestore so editors can change copy without code changes
- Generate static JSON files at export time (offline-safe, fast initial load, no Firestore dependency at runtime build)
- Allow tenant admins to override any default translation at runtime without a rebuild

## Non-Goals

- Migrating existing keys out of the monolithic file (done gradually, key-by-key, as separate work)
- Adding i18n to `data-access` or `util` libs (they rarely have user-facing strings; scope them only if needed)

---

## Architecture

### Layer overview

```
Firestore i18nDefault  ──export-i18n script──►  libs/{domain}/{layer}/src/i18n/{lang}.json
                                                          │
                                          Nx asset glob copies to app assets
                                                          │
                                             /assets/i18n/{domain}/{layer}/{lang}.json
                                                          │
                                          Transloco scope lazy-loads on demand
                                                          │
                                                   Component renders

Firestore i18nTenantOverride  ──after login──►  I18nOverrideService.merge()
                                                          │
                                          translocoService.setTranslation()
                                                          │
                                               Components re-render
```

---

## Section 1 — Firestore Data Model

### Collection `i18nDefault`

Source of truth for product default translations. Exported to static files by the `export-i18n` script.

| Field | Type | Description |
|---|---|---|
| `bkey` | `string` | Firestore document ID |
| `module` | `string` | `{domain}/{layer}` path, e.g. `chat/feature`, `shared/ui`. Use `app` for app-level keys that don't belong to a lib. |
| `key` | `string` | Translation key within the module scope, e.g. `fields.reconnecting` |
| `de` | `string` | German translation |
| `en` | `string` | English translation |
| `fr` | `string` | French translation |
| `es` | `string` | Spanish translation |
| `it` | `string` | Italian translation |
| `isHtml` | `boolean` | Whether the value contains HTML markup |
| `isArchived` | `boolean` | Soft delete flag |

No `tenants` field — defaults are product-wide and apply to all tenants.

### Collection `i18nTenantOverride`

Per-tenant runtime overrides applied after login. Same shape as `i18nDefault`, plus:

| Field | Type | Description |
|---|---|---|
| `tenantId` | `string` | The tenant this override applies to, e.g. `scs` |
| `tenants` | `string[]` | Multi-tenancy filter array, e.g. `['scs']` |

A tenant admin overrides a key by creating a document here with the same `module` + `key` as the default. The override uses the same full scoped key format used in templates.

---

## Section 2 — Export Script & Nx Integration

### Script: `scripts/export-i18n.ts`

Runs via the Firebase Admin SDK. Reads Firestore credentials from the existing `.env` files (same pattern as `set-env.js`).

**Algorithm:**
1. Query all `i18nDefault` documents where `isArchived == false`
2. Group documents by `module`
3. For each module × language, build a nested JSON object from all keys in that module
4. Write `libs/{domain}/{layer}/src/i18n/{lang}.json` — e.g. `libs/chat/feature/src/i18n/de.json`
5. Write `apps/scs-app/src/assets/i18n/app/{lang}.json` for module `app`
6. Generated files are committed to git (so builds work without Firestore access)

**Key structure in generated files:**

The `key` field in Firestore uses dot-notation within the module scope (e.g. `fields.reconnecting`). The script writes nested JSON:
```json
{
  "fields": {
    "reconnecting": "Verbindet…"
  }
}
```

### Nx target

Add a `export-i18n` target to the root `workspace` project:

```sh
pnpm nx run workspace:export-i18n
# or shorthand after nx.json wiring:
pnpm nx export-i18n
```

Requires env vars to be loaded first:
```sh
source ./apps/scs-app/.env && pnpm nx run workspace:export-i18n
```

### Asset globs in `apps/scs-app/project.json`

One entry per lib that has i18n files, added when the lib is first given translations:
```json
{ "glob": "*.json", "input": "libs/chat/feature/src/i18n", "output": "./i18n/chat/feature" },
{ "glob": "*.json", "input": "libs/shared/ui/src/i18n",   "output": "./i18n/shared/ui"   }
```

This mirrors the existing ionicons SVG asset glob pattern. The lib "publishes" its i18n files explicitly.

---

## Section 3 — Transloco Scope Integration

### Scope declaration

Each feature component that owns scoped translations provides its scope:

```typescript
@Component({
  providers: [{ provide: TRANSLOCO_SCOPE, useValue: 'chat/feature' }]
})
export class MatrixChat { ... }
```

Transloco resolves the scope to `/assets/i18n/chat/feature/{lang}.json`.

### Key format

| Type | Template usage | Resolves from |
|---|---|---|
| Legacy (unchanged) | `'@chat.fields.reconnecting'` | monolithic `de.json` key `chat.fields.reconnecting` |
| New scoped | `'@chat/feature.fields.reconnecting'` | `libs/chat/feature/src/i18n/de.json` key `fields.reconnecting` |

The `TranslatePipe` strips the `@` prefix and passes the remainder to `translocoService.selectTranslate()`. No changes to the pipe are needed — Transloco's `/` separator already distinguishes scoped from root keys.

### No forced migration

Existing `@domain.key` references in templates continue to work against the monolithic file. New keys for a lib go into the scoped file. Individual keys can be migrated gradually.

---

## Section 4 — Runtime Tenant Overrides

### `I18nOverrideService` in `@bk2/shared-i18n`

```
AppStore.currentUser() becomes available
  │
  ▼
Query i18nTenantOverride where tenantId == currentTenantId && isArchived == false
  │
  ▼
For scoped key: translocoService.setTranslation({ [doc.key]: value }, lang, { merge: true, scope: doc.module })
For legacy key: translocoService.setTranslation({ [`${doc.module}.${doc.key}`]: value }, lang, { merge: true })
  │
  ▼
Transloco re-renders affected components automatically
```

- Scoped overrides (module contains `/`, e.g. `chat/feature`) use Transloco's `scope` option so keys stay in the module's namespace
- Legacy overrides (module is a simple domain name with no `/`, e.g. `chat`) write the full dot-path directly into the root translation object
- Runs once per session; re-triggered when active language changes via `translocoService.langChanges$`
- Tenant admins can override both scoped keys and legacy monolithic keys using the same format

---

## Section 5 — CMS Editor Components

New domain: `libs/i18n/feature/`

### `I18nDefaultList` + `I18nDefaultEditModal`

- Lists all `i18nDefault` documents, filterable by `module`
- Create / edit / archive defaults
- Shows all language fields (de, en, fr, es, it) in the edit modal
- Route: `/admin/i18n/defaults` — guarded by `isAdminGuard`

### `I18nOverrideList` + `I18nOverrideEditModal`

- Lists `i18nTenantOverride` documents for the current tenant only
- Tenant admin can create, edit, or delete overrides
- The key picker shows available defaults as suggestions
- Route: `/admin/i18n/overrides` — guarded by `isPrivilegedGuard`

Both components follow the `AocWebsite` / `AocWebsiteEditModal` pattern exactly (store + list + edit modal).

---

## Section 6 — Backward Compatibility

- `apps/scs-app/src/assets/i18n/de.json` (and other languages) are **not modified**
- All existing `@domain.key` references in templates continue to work without any change
- The new system is additive: new keys go into scoped files; the monolith is the fallback
- Migration of individual keys from the monolith to scoped files is optional and can happen incrementally in separate PRs

---

## File Layout (end state)

```
apps/
  scs-app/
    src/assets/i18n/
      de.json               ← existing monolith, unchanged
      en.json               ← existing monolith, unchanged
      app/
        de.json             ← generated: app-level keys
        en.json
      chat/feature/
        de.json             ← generated from Firestore i18nDefault module=chat/feature
        en.json
      shared/ui/
        de.json
        en.json
      ...

libs/
  i18n/
    feature/
      src/lib/
        i18n-default.store.ts
        i18n-default-list.ts
        i18n-default-edit.modal.ts
        i18n-override.store.ts
        i18n-override-list.ts
        i18n-override-edit.modal.ts
  chat/
    feature/
      src/i18n/
        de.json             ← generated, committed to git
        en.json
  shared/
    i18n/
      src/lib/
        i18n-override.service.ts   ← NEW: runtime tenant merge

scripts/
  export-i18n.ts            ← NEW: Firestore → static files
```

---

## Open Questions / Future Work

- `test-app` uses the same monolithic pattern; apply the same export step when `test-app` needs scoped translations
- The `export-i18n` script can be extended to generate asset glob entries automatically, to avoid manual `project.json` edits per lib
- Consider a CI check that warns when a `TRANSLOCO_SCOPE` is declared but no i18n files exist for that scope

---
name: i18n
description: Use when adding, translating, or wiring up i18n strings — creating a feature's translation keys, building the store i18n, passing labels to forms/ui, adding a new lib's de.json, tenant overrides, or deciding between the store pattern and TranslatePipe. Covers Transloco setup, the store-driven util pattern, key format, build/sync, and migrating legacy scope.ts usage.
---

# i18n (Transloco, store-driven)

This project uses [Transloco](https://jsverse.github.io/transloco/). Default language **`de`**; supported: `de`, `en`, `fr`, `es`, `it`.

**The standard is store-driven:** translation keys live in `util`, the feature store resolves them once into `Signal<string>`s, and those flow down the component tree as `[i18n]` inputs. **Never use `TranslatePipe`/`AsyncPipe` for static keys** — that's the legacy path (see bottom).

## Key format

```
@<domain>[/<layer>].<path.to.key>
```

All keys start with `@`. `I18nService.translate()` returns any string **not** starting with `@` unchanged (literal passthrough — handy for fields that store either a key or plain text).

| Type | Example | Resolved from |
|---|---|---|
| Main bundle | `@calevent.create` | `assets/i18n/de.json` (in memory at startup) |
| Lazy scope | `@activity/feature.list.title` | `assets/i18n/activity/feature/de.json` (fetched on first use) |

A prefix (everything before the first `.`) containing `/` is a **lazy-loaded scope**.

## Standard pattern (store-driven) — use for all new code

### 1. Keys + type in `util` (not `feature`)

Defined in `util` so both the `feature` store and `ui` components import them without upward dependencies:

```ts
// libs/<domain>/<layer>/util/src/lib/<domain>-i18n.ts
import { Signal } from '@angular/core';

const PFX = '@<domain>/<layer>.';            // matches the Transloco scope

export const FEATURE_I18N_KEYS = {
  list_title:  PFX + 'list.title',
  empty: PFX + 'empty',
} satisfies Record<string, string>;

export type FeatureI18n = { [K in keyof typeof FEATURE_I18N_KEYS]: Signal<string> };
```

Export from the util barrel: `export * from './lib/<domain>-i18n';`

### 2. Store resolves the keys once

```ts
import { FEATURE_I18N_KEYS, FeatureI18n } from '@bk2/<domain>-util';

// in store withProps:
i18n: store.i18nService.translateAll(FEATURE_I18N_KEYS),   // Record<K, Signal<string>>
```

### 3. Flow top-down as `FeatureI18n` (no duck typing within a domain)

`FeatureI18n` is passed as-is down the tree within the same domain — no subset interfaces, no renaming, no `computed()` wrappers:

```text
store.i18n (FeatureI18n)
  → page / modal  →  [i18n]="store.i18n"
  → form          →  input.required<FeatureI18n>()  →  [i18n]="i18n()"
  → domain ui     →  input.required<FeatureI18n>()  →  reads i18n().key_name() directly
```

### Exception — duck typing only at the `shared/ui` boundary

`shared/ui` components (`TextInput`, `Checkbox`, `ButtonCopy`, …) are domain-agnostic and define their own minimal interface. Domain sub-components adapt with a `computed()`:

```ts
public readonly i18n = input.required<SectionI18n>();          // full domain type
protected directoryI18n = computed(() => ({
  label:       this.i18n().album_directory_label(),
  placeholder: this.i18n().album_directory_placeholder(),
  helper:      this.i18n().album_directory_helper(),
} as TextInputI18n));
```

### Components without a store

Inject `I18nService` directly — no wrapper store, no `providers` array:

```ts
export class XyzEditModal {
  protected readonly i18n     = inject(I18nService).translateAll(XYZ_I18N_KEYS) as XyzI18n;
  protected readonly appStore = inject(AppStore);   // if also needed
}
```

**A modal opened by a feature store must never import that store** — the store imports the modal, the modal imports the store → circular import; the store resolves to `undefined` at module init and Angular crashes with *"Cannot read properties of undefined (reading 'provide')"*. The direct-inject pattern above avoids it (no `providers`). If the store statically imports the modal, convert to a dynamic `await import('./xyz-edit.modal')` inside the opening method.

## Programmatic use (services, validators, utils)

`I18nService` (`@bk2/shared-i18n`):

```ts
inject(I18nService).translate('@domain/layer.key')   // Observable<string> (uses selectTranslate → waits for load)
inject(I18nService).translateAll(KEYS)               // Record<K, Signal<string>>
```

There is **no `t()` helper** — it was removed. Don't import `t` from `@bk2/shared-util-core`.

## Translation files

- **Main bundle:** `apps/scs-app/src/assets/i18n/<lang>.json` — loaded once at startup by `TranslocoHttpLoader`. Top-level keys are domain prefixes (`calevent`, `auth`, …).
- **Per-module scope:** each lib that owns keys keeps `libs/<domain>/<layer>/src/i18n/de.json`. Root key matches the domain; keys are **relative** (no `@`, no prefix):

```json
{ "list": { "title": "Meine Liste" }, "field": { "empty": "Leer" } }
```

These are served as static assets and fetched lazily from `assets/i18n/<domain>/<layer>/de.json`.

## Build integration & sync

The Angular build copies each lib's `src/i18n/` into `assets/i18n/<domain>/<layer>/` via the `assets` array in `apps/<app>/project.json` (output path must start with `./assets/i18n/`).

**After adding an `src/i18n/de.json` to a new lib, run:**

```sh
node scripts/sync-i18n-assets.mjs
```

It scans all `libs/**/src/i18n/de.json`, regenerates the asset entries, and rewrites every Angular app's `project.json` (non-Angular apps like `functions` are skipped). Skipping this → the new strings 404 at runtime.

## Tenant overrides

After login, `I18nOverrideService.init()` loads `I18nTenantOverride` docs for the current tenant and patches the live map:

```ts
this.translocoService.setTranslation({ [`${o.module}.${o.key}`]: value }, lang, { merge: true });
```

`I18nTenantOverrideModel` holds one field per language; overrides apply immediately on language change. Managed in the CMS at `/i18n/overrides`.

## Resolution flow

```
'@activity/feature.list.title'
  → I18nService.translate()  → strips '@' → prefix 'activity/feature' (has '/')
  → translocoService.load('activity/feature/de')
  → TranslocoHttpLoader GET assets/i18n/activity/feature/de.json
  → selectTranslate('activity/feature.list.title') → 'Aktivitäten'
```

Main-bundle keys (no `/` in prefix) skip the `load()` step — already in memory.

## Adding i18n to a new lib (checklist)

1. Create `libs/<domain>/<layer>/src/i18n/de.json` (root key = domain, relative keys).
2. Create `util/src/lib/<domain>-i18n.ts` with `PFX` + `*_I18N_KEYS` + the `…I18n` type; export from the util barrel.
3. In the store: `i18n: store.i18nService.translateAll(<KEYS>)`.
4. Pass `[i18n]` down; adapt at the `shared/ui` boundary with `computed()`.
5. `node scripts/sync-i18n-assets.mjs`.

## Legacy pattern — do NOT use for new code; migrate when you touch it

The repo still has ~122 files on the old pattern, being migrated out:

- **`scope.ts`** that only `export const PFX = '@<domain>/<layer>.'` (per layer). Replaced by the single `util/<domain>-i18n.ts` above.
- **`{{ pfx + 'list.title' | translate | async }}`** in templates for *static* keys. Replaced by store signals + `[i18n]`.

**To migrate:** move keys into `util/<domain>-i18n.ts` (`*_I18N_KEYS` + type), resolve once via the store's `translateAll`, pass `[i18n]` down, and delete the `scope.ts` usages.

**`TranslatePipe` is allowed in exactly one case:** keys that are **data-driven at runtime** — from a DB field, an `input()`, or a constructed string like `` `@prefix.${variable}.label` ``. Keep `TranslatePipe` (+ `async`) for those; never for hardcoded literals.

## Common mistakes

- `TranslatePipe`/`AsyncPipe` for a static key → use the store pattern.
- Importing a feature store into a modal that store opens → circular import; inject `I18nService` + dynamic-import the modal.
- Forgetting `sync-i18n-assets.mjs` after a new lib's `de.json` → strings 404.
- Duck-typing/subsetting `FeatureI18n` mid-domain → only adapt at the `shared/ui` boundary.
- Reaching for `t()` → removed; use `I18nService.translate()`.

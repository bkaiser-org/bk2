---
name: new-feature
description: Use when creating or scaffolding a brand-new feature domain (a CRUD entity with model + data-access/feature/ui/util layers) — e.g. "create a new feature/entity X", "scaffold a new lib for X". Covers the shared/models model (FEATUREModelName/FEATURECollection), the four layer libs and their files, the list route + optional detail-page route, and the navigate/call/context menuItems.
---

# New Feature

## Overview

A **feature** is a CRUD entity (e.g. `task`, `folder`, `invoice`) made of one shared model
plus four layer libs following the `@bk2/<feature>-<layer>` convention. This skill scaffolds
the model, the four layers, the routes, and the menu items.

**Canonical example — copy it:** the `task` feature.
- model: [task.model.ts](../../../libs/shared/models/src/lib/task.model.ts)
- data-access: [task.service.ts](../../../libs/task/data-access/src/lib/task.service.ts)
- feature: [task.store.ts](../../../libs/task/feature/src/lib/task.store.ts), [task-list.ts](../../../libs/task/feature/src/lib/task-list.ts), [task-edit.modal.ts](../../../libs/task/feature/src/lib/task-edit.modal.ts), [TASK.md](../../../libs/task/feature/src/lib/TASK.md)
- ui: [task.form.ts](../../../libs/task/ui/src/lib/task.form.ts) — but use the **current Signal Forms** pattern from [folder.form.ts](../../../libs/folder/ui/src/lib/folder.form.ts)
- util: [task.util.ts](../../../libs/task/util/src/lib/task.util.ts), [task.validations.ts](../../../libs/task/util/src/lib/task.validations.ts), [task-i18n.ts](../../../libs/task/util/src/lib/task-i18n.ts), [task.util.spec.ts](../../../libs/task/util/src/lib/task.util.spec.ts)

## Ask the user first

1. **Feature name** — singular, kebab-case (e.g. `widget`). Drives every file/alias name.
2. **Domain folder?** — does it belong to an existing domain (`cms`, `subject`, `finance`,
   `geo`, `relationship`)? If yes the libs live under `libs/<domain>/<feature>/<layer>` and
   the alias is `@bk2/<domain>-<feature>-<layer>` (e.g. `@bk2/finance-invoice-feature`). If
   no it is a top-level feature: `libs/<feature>/<layer>`, alias `@bk2/<feature>-<layer>`
   (e.g. `@bk2/task-feature`). Below, `FEATURE` = the feature name, `ALIAS` = the resolved alias prefix.
3. **Detail view** — modal (default, preferred) or also a `FEATURE-edit.page`? Only add a
   `:featureKey` route when a `.page` exists.
4. **listId** — the route always carries `:listId` (component `input('all')`). Does this feature
   partition its list now (folder key, tag, calendar), or just use `'all'`? (see `generating-lists`).
5. **List popover actions** — which context-menu items (e.g. `add`, `exportRaw`)? These drive
   both the ActionSheet and the **call menus** below.
6. **Route guards** — `isAuthenticatedGuard` (default), `isPrivilegedGuard`, or `isAdminGuard`?
7. **Menu tenants** — comma-separated tenant ID list for the menu items (e.g. `scs,kf`).
8. **New model fields** — the entity's fields/types. Creating a *new* model is expected; do
   **not** modify an existing model/schema (`shared-models`) without asking.

## Steps

1. **Model** in `shared/models` (see below). Export it from the `@bk2/shared-models` barrel.
2. **Create the four layer libs.** For each layer create `tsconfig.json`, update
   `tsconfig.lib.json` `references`, and create `package.json` with `"name": "@bk2/ALIAS-<layer>"`
   — copy a sibling lib (e.g. `libs/folder/<layer>/`) as a template. Register the aliases in
   `tsconfig.base.json`. (Missing/mis-scoped `package.json` → `TS6059 rootDir` build errors.)
3. Fill each layer's files (sections below). Export everything from each lib's `src/index.ts`.
4. **i18n** — keys in `util` (`FEATURE_I18N_KEYS`), `de.json` per lib. **REQUIRED: use the `i18n` skill.**
5. **List** — **REQUIRED: use the `generating-lists` skill** for `FEATURE-list.ts`.
6. **Icons** — **REQUIRED: use the `icons` skill** for any icon name/rendering.
7. **Route(s)** — add to [app.routes.ts](../../../apps/scs-app/src/app/app.routes.ts) (below).
8. **Menus** — create the navigate, call, and context `menuItems` via the **firebase MCP** (below).
9. **Type-check** — **REQUIRED: use the `fix-types` skill** (`npx tsc --noEmit -p libs/<path>/<layer>/tsconfig.json` per layer). Don't report done until it compiles clean.

## Model — `libs/shared/models/src/lib/FEATURE.model.ts`

Implements the base interfaces, uses `DEFAULT_*` constants from `@bk2/shared-constants`, takes
`tenantId` in the constructor, and **exports the collection + model-name constants**:

```ts
export class FeatureModel implements BkModel, PersistedModel, NamedModel, SearchableModel, TaggedModel {
  public bkey = DEFAULT_KEY;
  public tenants = DEFAULT_TENANTS;
  public isArchived = false;
  public name = DEFAULT_NAME;
  public index = DEFAULT_INDEX;
  public tags = DEFAULT_TAGS;
  public notes = DEFAULT_NOTES;
  // … feature-specific fields …

  constructor(tenantId: string) { this.tenants = [tenantId]; }
}

export const FeatureCollection = 'features';   // Firestore collection (plural)
export const FeatureModelName = 'feature';     // singular model name
```

## data-access — `FEATURE.service.ts`

`@Injectable({ providedIn: 'root' })`. Injects `FirestoreService`, `ENV`, `ActivityService`,
`I18nService`. CRUD via `firestoreService.createModel/updateModel/deleteModel` with
`FeatureCollection`; `list()` uses `searchData(FeatureCollection, getSystemQuery(env.tenantId), orderBy, sortOrder)`;
`read(key)` via `findByKey`. Recompute `index` (from `util`) before every write and
`activityService.log(...)` after. Add a `scope.ts` exporting `PFX = '@ALIAS-data-access.'`.

## feature — store, list, edit modal, FEATURE.md

- **`FEATURE.store.ts`** — `signalStore` with `withState` (filters: `searchTerm`, `selectedTag`,
  …), `withProps` (inject service + `AppStore` + `i18nService.translateAll(FEATURE_I18N_KEYS)`,
  `rxResource`s), `withComputed` (`featuresCount`, `filteredFeatures`, `isLoading`,
  `currentUser`, `tenantId`, `tags`), `withMethods` (setters + `add`/`edit`/`delete`/`export`,
  `edit` opens the modal and calls `create`/`update` on `confirm`, then `reload()`).
- **`FEATURE-list.ts`** — see the **`generating-lists` skill**.
- **`FEATURE-edit.modal.ts`** — `bk-header` + `bk-change-confirmation` (shown when valid &&
  dirty) + `bk-FEATURE-form`; clones the input into a `linkedSignal(safeStructuredClone(...))`,
  saves via `modalController.dismiss(formData, 'confirm')`.
- **`FEATURE.md`** — domain doc (Overview, Firestore Collection, Field Semantics table, Store,
  Components, Library Path). Model it on [TASK.md](../../../libs/task/feature/src/lib/TASK.md).
  **Use the `authoring-docs` skill** conventions.

### Store ↔ edit-modal DI contract (avoids `NG0201` + circular-import crashes)

The feature `signalStore` is **component-provided** — listed in `providers: [FeatureStore]` on
`FEATURE-list.ts`, **not** `providedIn: 'root'`. Ionic presents modals via
`ModalController.create()` using the **root environment injector**, which cannot see the list
component's providers. So any edit/view modal that does `inject(FeatureStore)` MUST follow BOTH
rules — getting one without the other still crashes:

1. **The modal declares its own `providers: [FeatureStore]`** in its `@Component` decorator.
   Otherwise opening it throws `NG0201: No provider found for SignalStore`. (The modal gets its
   own store instance; that's fine — it only reads `i18n`/labels/`tags`/`tenantId`, all derived
   from the root `AppStore`. The list's store instance still does the actual save on `confirm`.)
2. **The store imports the modal dynamically** inside `add()`/`edit()`:
   `const { FeatureEditModal } = await import('./feature-edit.modal');` — **never** a top-level
   `import { FeatureEditModal }`.

Why #2: the modal already statically imports the store (needed for `providers` + `inject`). A
top-level `import` of the modal *from the store* closes a static import cycle. Because
`providers: [FeatureStore]` is evaluated at the modal's **module-load time** (when its
`@Component` decorator runs), that cycle can leave `FeatureStore` in its temporal-dead-zone →
`ReferenceError: Cannot access 'FeatureStore' before initialization` (or a silent
`providers: [undefined]`), depending on load order. The dynamic `import()` breaks the cycle so
the store finishes initializing first.

If a modal instead receives its data via `input()`s and does **not** inject the store (e.g. the
`booking`/`invoice` view modals), neither rule applies and a plain top-level import is fine.

Canonical correct examples: `trip`, `person`, `org`, `location`.

## ui — `FEATURE.form.ts` (pure, Signal Forms)

Pure presentational form. **Use Angular Signal Forms** per CLAUDE.md (NOT the legacy
`linkedSignal`/manual pattern still seen in `task.form.ts`). Copy [folder.form.ts](../../../libs/folder/ui/src/lib/folder.form.ts):

```ts
public formData = model.required<FeatureModel>();
protected readonly featureForm = form(this.formData, (path) =>
  validateVestTree(path, featureValidations as any));
constructor() { effect(() => this.valid.emit(this.featureForm().valid())); }
```

Inputs: `i18n` (`FeatureI18n`), `formData` (model), `currentUser`, `allTags`, `readOnly`,
`showForm`. Outputs: `dirty`, `valid`. Use `@bk2/shared-ui` inputs (`bk-text-input`,
`bk-notes-input`, `bk-date-input`, `bk-cat-select`, `bk-chips`, `bk-error-note`).

## util — FEATURE.util, spec, validations, i18n

- **`FEATURE.util.ts`** — pure functions: `isFeature(x, tenantId)` type guard (via `isType`),
  `getFeatureIndex(feature)` (via `addIndexElement`), `getFeatureIndexInfo()`.
- **`FEATURE.util.spec.ts`** — Vitest unit tests for every util function (project QA rule).
- **`FEATURE.validations.ts`** — Vest `staticSuite((model, tenants, tags, field?) => { if (field) only(field); baseValidations(...); … })` composing helpers from `@bk2/shared-util-core`.
- **`FEATURE-i18n.ts`** — `FEATURE_I18N_KEYS` (`satisfies Record<string,string>`) + `export type FeatureI18n = { [K in keyof typeof FEATURE_I18N_KEYS]: Signal<string> }`. **Use the `i18n` skill.**

## Routes — `apps/scs-app/src/app/app.routes.ts`

Add a **list** route (always) and an optional **detail-page** route. The list route always uses
`:listId/:contextMenuName`: `:contextMenuName` carries the context-menu name (`FEATURE-context`,
e.g. `forms-context`), and `:listId` carries the list partition (default `'all'` — see `generating-lists`).

```ts
{
  path: 'FEATURE',
  canActivate: [isAuthenticatedGuard],
  children: [
    { path: ':listId/:contextMenuName', canActivate: [isPrivilegedGuard],
      loadComponent: () => import('@bk2/ALIAS-feature').then(m => m.FeatureList) },
    // optional, only if a FEATURE-edit.page exists:
    { path: ':featureKey', loadComponent: () => import('@bk2/ALIAS-feature').then(m => m.FeatureEditPage) },
  ],
},
```

(The list route always keeps `:listId/:contextMenuName` — pass `all` when the feature has no
partition yet (`listId = input('all')` in the component). CLAUDE.md: always add the `*.list`
route; only add the detail route when a `*.page` exists — modals never get routes.)

## Menus — `menuItems` Firestore collection (firebase MCP)

Menus are **data**, not code. Create them automatically with the **firebase MCP**
`firestore_add_document` tool into the `menuItems` collection (`MenuItemCollection`). See the
[MENU.md](../../../libs/cms/menu/feature/src/lib/MENU.md) field/action reference. Use the
tenants the user gave. There are three kinds (create the call menus before the context menu).

> **Caution — live write.** This writes to the project's real Firestore. Confirm the tenant
> list and the feature name with the user first. Menus are looked up by their `name` **field**
> (`MenuService.read` → `findByKey(..., 'name')`), so the auto-generated document ID is fine.

### Document shape (all three kinds)

`firestore_add_document` takes Firestore-typed `fields`. Never write `bkey` — it **is** the
document ID (stripped on write, re-attached on read). Per [MenuItemModel](../../../libs/shared/models/src/lib/menu-item.model.ts):

| Field | Type | Notes |
|---|---|---|
| `name` | `stringValue` | unique lookup key |
| `index` | `stringValue` | `n:<name> a:<action> k:` (the app recomputes `k:<bkey>` on next save; lookups are by `name`) |
| `action` | `stringValue` | `navigate` / `call` / `context` |
| `url` | `stringValue` | route or call value |
| `label` | `stringValue` | i18n key (empty for the context menu) |
| `icon` | `stringValue` | an `icons`-set name (e.g. `list`, `add`); default `help-circle`. **Pick via the `icons` skill — NOT Ionicon `-outline` names** (they 404 → blank icon) |
| `roleNeeded` | `stringValue` | `admin` / `privileged` / … |
| `menuItems` | `arrayValue` of `stringValue` | call-menu names (context menu only; `[]` otherwise) |
| `tenants` | `arrayValue` of `stringValue` | the tenant IDs |
| `data` | `arrayValue` | `[]` |
| `description` | `stringValue` | `''` |
| `tags` | `stringValue` | `''` |
| `isArchived` | `booleanValue` | `false` |

Example call (`navigate` menu, tenant `scs`):

```jsonc
firestore_add_document({
  collectionId: "menuItems",
  document: { fields: {
    name:        { stringValue: "feature-all" },
    index:       { stringValue: "n:feature-all a:navigate k:" },
    action:      { stringValue: "navigate" },
    url:         { stringValue: "/feature/all/feature-context" },
    label:       { stringValue: "@feature/feature.plural" },
    icon:        { stringValue: "list" },
    roleNeeded:  { stringValue: "admin" },
    menuItems:   { arrayValue: { values: [] } },
    tenants:     { arrayValue: { values: [{ stringValue: "scs" }] } },
    data:        { arrayValue: { values: [] } },
    description: { stringValue: "" },
    tags:        { stringValue: "" },
    isArchived:  { booleanValue: false }
  } }
})
```

There are three kinds:

### 1. Navigate menu (entry point)

| Field | Value |
|---|---|
| `name` | `FEATURE-all` |
| `label` | `@FEATURE/feature.plural` |
| `roleNeeded` | `admin` |
| `action` | `navigate` |
| `url` | `/FEATURE/all/FEATURE-context` (use the real listId instead of `all` if the feature partitions its list) |
| `icon` | an `icons`-set name (e.g. `list`) — **choose via the `icons` skill, no `-outline` suffix** |
| `tenants` | (ask user) |

### 2. Call menu — one per list popover action

For **each** popover action from the list (step 5), create:

| Field | Value |
|---|---|
| `name` | `FEATURE-POPOVEROP` (lowercase, e.g. `feature-exportraw`, `feature-add`) |
| `label` | `@FEATURE/feature.context.POPOVEROP` |
| `roleNeeded` | `privileged` |
| `action` | `call` |
| `url` | `POPOVEROP` (lowercase — matches the `onPopoverDismiss` switch case) |
| `icon` | an `icons`-set name matching the action (e.g. `add`, `download`) — **choose via the `icons` skill, no `-outline` suffix** |
| `tenants` | same as navigate menu |

### 3. Context menu (groups the call menus)

| Field | Value |
|---|---|
| `name` | `FEATURE-context` (e.g. `forms-context`) |
| `label` | *(empty)* |
| `roleNeeded` | `privileged` |
| `action` | `context` |
| `icon` | `help-circle` (context menus conventionally keep the default; pick another via the `icons` skill if needed) |
| `menuItems` | all the call-menu names from step 2 |
| `tenants` | same as navigate menu |

Map each table's values into the typed `fields` shape above and call `firestore_add_document`
once per menu — **call menus first**, then the context menu (referencing them), then the
navigate menu. Verify afterwards with `firestore_query_collection` on `menuItems` filtered by `name`.

## Common mistakes

- `package.json` missing the `@bk2/` scope or wrong name → `TS6059 rootDir` build errors in dependents.
- Forgetting to register the new aliases in `tsconfig.base.json`, or to export from each `src/index.ts`.
- Forgetting `FeatureCollection` / `FeatureModelName` exports, or not exporting the model from the `@bk2/shared-models` barrel.
- Using the **legacy** form pattern (`task.form.ts`) instead of Signal Forms (`folder.form.ts`).
- Giving a route to the edit **modal** (modals never get routes); or omitting the `*.list` route.
- An edit/view modal that `inject()`s the component-provided `FeatureStore` but omits
  `providers: [FeatureStore]` → `NG0201: No provider found for SignalStore` when opened (Ionic
  modals use the **root** injector, not the list's). And if the store top-level-`import`s the
  modal, switch it to a dynamic `await import('./feature-edit.modal')` — otherwise adding
  `providers` closes a module cycle that crashes with a `FeatureStore` TDZ `ReferenceError`. See
  *Store ↔ edit-modal DI contract* above.
- Call-menu `url` not matching the list's `onPopoverDismiss` switch case (lowercase mismatch).
- Writing a `bkey` field on a menu document (it **is** the doc ID), or passing raw JSON instead of Firestore-typed `Value`s (`stringValue`/`arrayValue`/`booleanValue`) to `firestore_add_document`.
- Using Ionicon `-outline`/`-sharp` icon names (e.g. `list-outline`, `add-circle-outline`) for the `icon` field — the DB `icons` set has no such names, so they 404 and render blank. Pick a real name via the **`icons` skill**.
- Skipping the per-util unit tests (`FEATURE.util.spec.ts`) — required by project QA.
- Modifying an existing `shared-models` model/schema without asking first.

# CMS Improvements — Implementation Specification

**Project:** bk2  **Status:** Draft  **Last updated:** 2026-05-26  **Stack:** Angular 20 \+ Ionic \+ Firebase  
**Source review:** [docs/2026-05-25-cms-review.md](2026-05-25-cms-review.md)
**Scope:** `libs/cms/menu`, `libs/cms/page`, `libs/cms/section`

---

## 1. Overview

This specification describes the work required to address every finding in the CMS review (`2026-05-25-cms-review.md`). The review concluded that the CMS architecture is solid (4-layer libs, dispatcher pattern, discriminated unions, soft deletes, store-driven i18n) but identified gaps in functionality, robustness, and test coverage.

This spec breaks the work into self-contained workstreams that can be implemented and verified independently, prioritized in the order recommended by the review.

---

## 2. Goals and non-goals

### Goals

- Complete every Section type that currently exists in the model (`calendar`, `chart`, `files`, `links`, `rag`, `member-age`, `member-cat`) with full edit-UI.
- Add user-facing error handling to all three stores (`MenuStore`, `PageStore`, `SectionStore`).
- Raise unit-test coverage to include services, stores, and validations (currently only `util/`).
- Make the CMS robust against bad data (circular menu refs, missing sections).
- Introduce pagination/virtual scrolling for list views.
- Wire `SectionForm` into Vest validation per section type.
- Replace the export stubs with a real JSON export.
- Improve search index quality (full-text on `title` + `content`).
- Replace UX placeholders (no loading skeletons, magic `@VERSION@` token) with proper patterns.

### Non-goals

- New Section types beyond what already exists in `section.model.ts`.
- Migration of existing Firestore data (changes must be backwards-compatible).
- A full WYSIWYG redesign of the section editors.
- Server-side or function-side rendering of pages.
- Replacing NgRx Signal Stores with another state library.

---

## 3. Priority and sequencing

Workstreams are grouped by priority from the review. Within a priority tier, items can be done in parallel; across tiers, finish HIGH before MEDIUM, MEDIUM before LOW.

| Tier | Workstream | Section |
| :---- | :---- | :---- |
| HIGH | Store error state | §4 |
| HIGH | Calendar edit UI | §5 |
| HIGH | Chart edit UI | §6 |
| HIGH | Files & Links sections — decide and execute | §7 |
| MEDIUM | Unit tests for services and stores | §8 |
| MEDIUM | Vest validation in `SectionForm` | §9 |
| MEDIUM | Pagination / virtual scrolling | §10 |
| MEDIUM | Circular menu reference protection | §11 |
| LOW | Export implementation | §12 |
| LOW | Loading skeletons | §13 |
| LOW | Full-text search index | §14 |
| LOW | RAG config UI | §15 |
| LOW | Member-age / member-cat config UI | §16 |
| LOW | Blog layout audit | §17 |
| LOW | `@VERSION@` token cleanup | §18 |

Each workstream below is structured: *Problem → Acceptance criteria → Implementation plan → Out-of-scope*.

---

## 4. HIGH — Store error state

### Problem

`MenuStore`, `PageStore`, `SectionStore` expose `isLoading` but no error state. A failed Firestore write or `rxResource` stream error currently surfaces only in the console. There is no way for a UI to show a toast, alert, or inline message.

### Acceptance criteria

- Each of the three stores exposes:
  - `isError: Signal<boolean>` (computed)
  - `errorMessage: Signal<string | undefined>` (the last user-facing error message, already translated)
  - `clearError(): void` method
- Every `withMethods` action that performs a Firestore mutation catches errors, sets the error state, and re-throws (so the caller — usually the modal — can still react).
- `rxResource` stream errors propagate into the same error state via `tapResponse` / `catchError`.
- A new shared `ErrorBanner` component (in `@bk2/shared-ui`, if not already present) renders the error message above the list/edit views.
- `MenuList`, `PageList`, `SectionAllList`, `MenuModal`, `PageEditModal`, `SectionEditModal` all render the banner.

### Implementation plan

1. **Models.** Add `error: string | undefined` to each store's `initialState` (or use a dedicated `withErrorState()` custom feature in `@bk2/shared-feature` for reuse).
2. **Custom feature** `withErrorState()`:
   - Provides `error`, `isError`, `errorMessage` signals and a `setError(msg)` + `clearError()` method.
   - Lives in `libs/shared/feature/src/lib/with-error-state.ts`.
3. **Apply** the feature to `MenuStore`, `PageStore`, `SectionStore`.
4. **Wrap** every `pageService.create/update/delete/archive/...` call (same for menu/section) in a try/catch. On error, call `setError(this.i18n.error_save())` (key per-action).
5. **Stream errors:** add `catchError` to each `rxResource.stream`, log via `debugData`, then `setError`. Return an empty payload so the rest of the UI stays usable.
6. **i18n keys:** add `@cms/page.error.save`, `@cms/page.error.load`, `@cms/page.error.delete` (and the same family for menu and section) to the translation files.
7. **ErrorBanner**: tiny presentational `<bk-error-banner [message]="…" (dismiss)="…">` rendering an `ion-item color="danger"`. Place under header in list/edit views.

### Out-of-scope

- Sentry/observability integration (separate workstream).
- Distinguishing transient vs. permanent errors.

---

## 5. HIGH — Calendar (`cal`) edit UI

### Problem

`SectionForm` switch has an empty `@case('cal')` block. Users can render calendar sections (via `bk-calendar-section`) but cannot configure them. The model side (`CAL_SECTION_SHAPE`, `CalendarSection`) exists already.

### Acceptance criteria

- A new `bk-calendar-config` component (`libs/cms/section/ui/src/lib/calendar-configuration.ts`) edits all calendar-specific properties (event scope, default view, max items, time range, color scheme — whatever is currently in `CalendarConfig`).
- `SectionForm` `@case('cal')` renders `<bk-calendar-config>` and wires `(formDataChange)` into a new `onCalendarConfigChange(config)` method on the form.
- A Vest suite `calendar-section.validations.ts` (already exists in `util/`) is enforced via the section form validation (see §9).
- Creating a new `cal` section from `CardSelectModal` produces a calendar section with sensible defaults, and an admin can edit every field round-trip.

### Implementation plan

1. **Audit `CalendarConfig`** in `libs/shared/models/src/lib/section.model.ts`. Document every field in this spec (TODO during implementation).
2. **Component**: model `bk-calendar-config` on the pattern of `bk-events-config` (`events-configuration.ts`) — it is the closest analogue (filtering, scope, max items).
3. **Section form**:
   - Add `calendarConfig = linkedSignal(...)` selector.
   - Add `onCalendarConfigChange(config)` setter.
   - Fill the empty `@case('cal')`.
4. **i18n keys**: add `@cms/section.cal.*` translation keys for every field label/placeholder/helper.

### Out-of-scope

- Multiple calendar sources / external ICS feeds (not modeled).

---

## 6. HIGH — Chart edit UI

### Problem

Analogous to §5 — `@case('chart')` in `SectionForm` is empty. `ChartSection` model exists; `bk-chart-section` renders charts (probably via ngx-charts or chart.js — confirm during implementation). Admins cannot configure chart type, data source, axes, colors.

### Acceptance criteria

- A new `bk-chart-config` component (`libs/cms/section/ui/src/lib/chart-configuration.ts`) edits all chart-specific properties.
- `SectionForm` `@case('chart')` renders `<bk-chart-config>`.
- Chart sections can be created and edited round-trip.

### Implementation plan

1. **Audit `ChartConfig`** in the model.
2. **Component**: chart type selector (bar / line / pie / etc.), data source picker (which Firestore collection or static dataset), axis labels, color scheme.
3. **Section form**: identical wiring to §5.
4. **Validations**: ensure `chart-section.validations.ts` is wired (see §9).

### Out-of-scope

- A full data-binding editor (mapping field paths to chart axes is a follow-up).

---

## 7. HIGH — Files & Links sections — decide and execute

### Problem

`FilesSection` and `LinksSection` exist in `section.model.ts` but have:
- No feature components
- No dispatcher cases
- No `createSection()` case
- No `narrowSection()` case
- No validations
- No config UI

They are vapor types. They will either break at runtime if encountered or be silently filtered out.

### Acceptance criteria

Choose one path with the product owner before starting:

**Path A — Implement.**
- Feature components `FilesSectionComponent`, `LinksSectionComponent` rendering the lists.
- Config components `bk-files-config`, `bk-links-config` editing `FilesConfig`/`LinksConfig`.
- Dispatcher: `@case('files')` and `@case('links')` wired.
- `createSection()` and `narrowSection()` handle both.
- Both validations present.
- Both types appear in the section-type picker.

**Path B — Remove.**
- Delete `FilesSection`, `FilesConfig`, `LinksSection`, `LinksConfig` from `section.model.ts`.
- Remove from `SectionModel` discriminated union.
- Confirm no Firestore data uses these types (run a one-off query in dev).

### Decision input

The review marks both as "exist only on paper." Path A is more work; Path B is cleaner if the product roadmap does not need them. **Default to Path B unless the product owner says otherwise.**

### Implementation plan (Path A)

Mirrors the pattern of `NewsSection` or `ActivitiesSection` (both lists of items with a "more" button).
1. Data layer: extend `SectionService` if a specialized read is needed (probably not — files/links lists live inside the section properties).
2. Feature component: list rendering, pagination if `maxItems` is set.
3. Config component: edit `moreUrl`, `maxItems`, and the items themselves (a small CRUD inside the config form).
4. Dispatcher + factory + narrow + validations.
5. i18n keys.

### Implementation plan (Path B)

1. `grep -rn "FilesSection\|FilesConfig\|LinksSection\|LinksConfig" libs apps` and remove every reference.
2. Drop from the `SectionModel` union in `section.model.ts`.
3. Run `pnpm nx affected --target=build` to confirm clean.
4. Run a dev-database query to confirm no production data is of type `'files'` or `'links'` before merging.

### Out-of-scope

- Migration tooling if production data exists with these types (re-evaluate after the dev-database check).

---

## 8. MEDIUM — Unit tests for services and stores

### Problem

Only 3 `.spec.ts` files exist (all in `util/`). 139 source files in CMS, no test coverage on services, stores, forms, or section components. High regression risk.

### Acceptance criteria

- Each of `MenuService`, `PageService`, `SectionService` has a spec covering: `list`, `read`, `create`, `update`, `archive`, error cases. Firestore is mocked via the test doubles in `@bk2/shared-feature` test utilities (or a new `firestore.mock.ts`).
- Each of `MenuStore`, `PageStore`, `SectionStore` has a spec covering: initial state, happy-path CRUD, error state (after §4), search/filter computed signals, soft delete.
- Each section validation file (`*.validations.ts`) has at least one spec asserting required-field violations.
- CI command `pnpm run testlibs` passes.

### Implementation plan

1. **Test scaffold**. Create a shared `libs/shared/feature/src/testing/firestore-mock.ts` exposing helpers `mockCollection`, `mockDoc`, `mockError`. Use Vitest's `vi.fn()` and rxjs `of`/`throwError`.
2. **Services.** Per service:
   - One spec file `<name>.service.spec.ts` next to source.
   - Tests use the firestore mock to verify the right collection/doc paths are touched and the right `update` payloads land.
3. **Stores.** Per store:
   - One spec file `<name>.store.spec.ts`.
   - Use `TestBed.configureTestingModule` to instantiate with mocked services.
   - Drive state via input signals, assert computed outputs.
4. **Validations.** One spec per `*.validations.ts` — input good and bad shapes, expect the right vest failure messages.
5. **Coverage budget.** Aim for ≥60% on services/stores, ≥80% on validations. Do not chase 100% — guard against regressions, not coverage metrics.

### Out-of-scope

- E2E tests (separate concern; Playwright is not configured).
- Snapshot tests for section components.

---

## 9. MEDIUM — Vest validation in `SectionForm`

### Problem

`MenuForm` and `PageForm` use Vest suites for end-to-end form validation. `SectionForm` does not — the file has a comment "we do not use vest here" because the form is generic over a discriminated union. As a result, the 22 `*.validations.ts` files in `section/util/` are unused.

### Acceptance criteria

- `SectionForm` runs a per-type vest suite, picked at runtime from `formData().type`.
- Invalid fields show inline errors using the same `bk-error-shape` pattern as `PageForm`.
- The form's `valid`/`dirty` signals correctly reflect validation state.
- Save buttons in `SectionEditModal` are disabled when invalid.

### Implementation plan

1. **Suite registry.** Create `libs/cms/section/util/src/lib/section-validation-registry.ts`:
   ```ts
   export const SECTION_VALIDATION_SUITES: Record<SectionType, StaticSuite<...>> = {
     article: articleSectionValidations,
     button:  buttonSectionValidations,
     // ...
   };
   ```
2. **SectionForm**:
   - Inject `[scVestForm]` like `MenuForm` does.
   - Compute the active suite via `computed(() => SECTION_VALIDATION_SUITES[formData().type])`.
   - Pass the suite into the form via `[suite]`.
3. **Audit each `*.validations.ts`** — add missing rules so the field set matches what the corresponding configuration component edits.
4. **Section types without a suite yet** (after adding cal/chart in §5/§6) — author a suite.
5. **Cleanup**: remove the old "we do not use vest here" comment.

### Out-of-scope

- Async/server-side validation.

---

## 10. MEDIUM — Pagination / virtual scrolling

### Problem

`PageList`, `MenuList`, `SectionAllList`, and `SectionService.searchByKeys()` all load full collections. For tenants with hundreds of sections/pages, this is wasteful and slow.

### Acceptance criteria

- List views render incrementally; the user can scroll through thousands of items without freezing the UI.
- Initial paint shows the first page of items within 200ms of the data arriving.
- No regression for small tenants (no UX downgrade like a "Load more" button if the list is short).
- `SectionService.searchByKeys()` accepts and uses a `limit` parameter.

### Implementation plan

Two complementary approaches; pick one per list:

**A — Ionic Virtual Scroll** (preferred for visual lists like `PageList`/`MenuList`).
- Wrap the `<ion-list>` in `<ion-content>` with `<cdk-virtual-scroll-viewport itemSize="64">`.
- Bind to the `filteredPages` signal as-is — the store still loads all items, but the DOM only renders what's visible.

**B — Firestore-side pagination** (preferred for `SectionAllList` where the data set is large enough that even loading all keys is slow).
- Add `startAfter` cursor support to `FirestoreService` (if not already there).
- Store exposes a `loadMore()` method appending to a paginated signal.
- IntersectionObserver in the list triggers `loadMore()` near the end.

### Decision matrix

| List | Approach | Notes |
| :---- | :---- | :---- |
| `MenuList` | A (virtual scroll) | Menus are small but rendering trees can be heavy |
| `PageList` | A (virtual scroll) | Typical tenant has <500 pages |
| `SectionAllList` | B (firestore pagination) | Hundreds-of-thousands possible |

### Out-of-scope

- Server-side search (Algolia / Firestore extension). Local filtering of the loaded window is acceptable.

---

## 11. MEDIUM — Circular menu reference protection

### Problem

The `Menu` component renders sub-menus recursively. A circular reference in `menu.items` (Menu A → Menu B → Menu A) causes a stack overflow on render.

### Acceptance criteria

- Rendering a circular menu does not crash the app.
- A `debugData` warning is emitted naming the offending menu key.
- The cycle is broken at the second occurrence (the repeated node renders as a placeholder, "↻ circular reference to {name}", visible to admins only).
- Depth is hard-capped at 8 levels regardless of cycle status (defensive limit against accidental deep nesting).

### Implementation plan

1. **`Menu` component** receives an `inputDepth` and an `inputVisitedKeys: Set<string>`.
2. Default values at the root: `depth=0`, `visitedKeys=new Set()`.
3. Before rendering a child, check `visitedKeys.has(child.bkey) || depth >= 8`. If so, render the placeholder.
4. Otherwise pass `depth+1` and `new Set([...visitedKeys, child.bkey])` to the child.
5. Unit test in `menu.spec.ts` covers a 3-node cycle.

### Out-of-scope

- Preventing cycles at write time (separate validation in `MenuModal` could be added; not required to meet the acceptance criteria).

---

## 12. LOW — Export implementation

### Problem

```ts
async export(type: string) { console.log(...'not yet implemented'); }
```
Both `PageStore` and `SectionStore` have stub `export()` methods.

### Acceptance criteria

- `pageStore.export('json')` downloads a `.json` file containing the currently-filtered pages (or all pages, decision below).
- `pageStore.export('csv')` downloads a `.csv` with one row per page, columns: `bkey, name, type, state, tags, modifiedAt`.
- `sectionStore.export('json' | 'csv')` analogous.
- Export respects the active filter (`filteredPages` / `filteredSections`).
- Existing toolbar buttons that trigger export now work.

### Implementation plan

1. **Helper**: `libs/shared/util-angular/src/lib/download-file.ts` — given a blob and filename, triggers a download. (Check if it already exists.)
2. **Serializer**: `libs/shared/util-core/src/lib/serialize.ts` — `toJson(items)`, `toCsv(items, columns)`.
3. **Store methods**: replace the stub with real code that builds the blob and calls the helper.
4. **i18n**: filename like `pages-2026-05-26.json` (locale-formatted).

### Out-of-scope

- Excel (`.xlsx`) export. JSON + CSV is enough.
- Import / re-upload.

---

## 13. LOW — Loading skeletons

### Problem

`isLoading` is exposed by stores but list views render an empty container during load, not a skeleton.

### Acceptance criteria

- `PageList`, `MenuList`, `SectionAllList` render an Ionic skeleton (`<ion-skeleton-text>`) row for the first 6 visible items while `isLoading()` is true.
- Detail/edit views render a skeleton form while the resource is loading.
- The skeleton is removed within one animation frame of the data arriving (no flicker).

### Implementation plan

1. Create `BkListSkeleton` in `@bk2/shared-ui` — a small component rendering N rows of `<ion-skeleton-text>`.
2. Wrap each list's `<ion-list>` in `@if (isLoading()) { <bk-list-skeleton [rows]="6" /> } @else { ... }`.
3. Edit modals: use `<bk-form-skeleton>` (new) with placeholder shapes for the typical field count.

### Out-of-scope

- Shimmer animation customization beyond Ionic defaults.

---

## 14. LOW — Full-text search index

### Problem

Current indices are narrow:
```
menuIndex:   'n:name a:action k:bkey'
pageIndex:   'n:name k:bkey'
sectionIndex:'n:name t:type'
```
A user searching for a word in `title`, `subTitle`, or rich `content` will not find the matching section.

### Acceptance criteria

- Section index includes `title` and `subTitle` (lowercased, deaccented).
- Page index includes `title`.
- Menu index unchanged (no rich text fields).
- Existing exact-key search keeps working.
- Index update happens transparently on `create` / `update`.

### Implementation plan

1. **Tokenizer**: in `@bk2/shared-util-core`, add `buildSearchTokens(text: string): string` returning a space-joined, lowercased, deaccented token string with stop words removed (German + English stop word lists).
2. **`getSectionIndex(section)`**: extend to include `' tt:' + tokens(section.title) + ' st:' + tokens(section.subTitle)`. Cap output at ~1000 chars to stay well under Firestore's 1500-byte indexed-field limit.
3. **`getPageIndex(page)`**: extend with `tt:` token block.
4. **Stripping HTML**: section `content` is HTML (rich editor). Strip tags before tokenizing. Use a small allowlist-based regex in util-core (no dependency on a parser).
5. **Backfill**: write a one-shot maintenance script `apps/functions/src/tools/reindex-cms.ts` that reads all pages/sections, recomputes the index, writes back. Run manually after deploy.

### Out-of-scope

- Fuzzy matching / typo tolerance. The improved index is still substring-based.
- Switching to Algolia or Firestore Search Extension.

---

## 15. LOW — RAG section configuration

### Problem

`RagSectionComponent` exists but has no config UI. The review notes a hardcoded `model='gemini-3-flash-preview'`. (A code search did not surface the exact string today — confirm during implementation.) Looks like a proof-of-concept.

### Acceptance criteria

- `bk-rag-config` (new) lets admins pick: model name, system prompt, allowed document scope (folder path or tag), max tokens.
- The hardcoded model in `rag-section.ts` is replaced by `section.properties.model`.
- `createSection('rag', ...)` produces a default `RagConfig`.
- Dispatcher already has `@case('rag')` — confirmed.

### Implementation plan

1. **Model**: ensure `RagConfig` has `model`, `systemPrompt`, `documentScope`, `maxTokens`. Extend if missing (database schema change — requires user approval per CLAUDE.md hard rules).
2. **Factory**: add `case 'rag'` to `createSection()` and `narrowSection()`.
3. **Config component** + form wiring (analog to §5/§6).
4. **Validation**: `rag-section.validations.ts`.
5. **Remove hardcoded model literal** in `rag-section.ts` (or its store).

### Out-of-scope

- Switching RAG backend providers. Model name is just a string; backend dispatch is handled in the Cloud Function.

---

## 16. LOW — Member-age / member-cat config UI

### Problem

`MemberAgeSection` and `MemberCatSection` are read-only — components and stores exist, but no edit-config UI.

### Acceptance criteria

- `bk-member-age-config` and `bk-member-cat-config` allow editing the section's title, subtitle, filters (org scope, category filter), display options (chart type, sort order).
- `SectionForm` switch has matching cases.
- Both validations present.

### Implementation plan

Identical pattern to §5/§6/§15. Likely a small form — these sections compute their data, the config is just filters and display.

### Out-of-scope

- Adding new statistics beyond what `MemberAgeSection` / `MemberCatSection` already compute.

---

## 17. LOW — Blog layout audit

### Problem

`BlogLayoutType` is `'minimal' | 'grid' | 'classic' | 'magazine' | 'bento' | 'stream'`. Components exist for all six (`blog-minimal.ts` … `blog-stream.ts`). Review questions whether they are all complete.

### Acceptance criteria

- Each of the six layouts renders a representative blog page without console errors.
- Each layout is documented in `libs/cms/page/feature/src/lib/PAGE.md` with a screenshot and one-paragraph description.
- A user/admin can switch `page.blogType` and see the layout change live.
- Any layout found to be incomplete is either finished or removed from `BlogLayoutType`.

### Implementation plan

1. Manual smoke test of each layout in the running app with sample blog data.
2. Document gaps inline as TODOs.
3. Fix or remove per gap.
4. Update `PAGE.md`.

### Out-of-scope

- A new blog layout.

---

## 18. LOW — `@VERSION@` token cleanup

### Problem

`menu.store.ts` does a literal `String.replace('@VERSION@', 'v' + versionService.getCurrentVersion())` on the menu label. Hidden behavior, easy to break.

### Acceptance criteria

- The mechanism is documented in `MENU.md`.
- All supported tokens are defined in one place (a constants file).
- The replacement is unit-tested.
- Adding a new token is a one-file change.

### Implementation plan

1. **Constants**: `libs/cms/menu/util/src/lib/menu-tokens.ts`:
   ```ts
   export const MENU_TOKENS = {
     VERSION: () => 'v' + inject(VersionService).getCurrentVersion(),
     // future: TENANT_NAME, USER_NAME, ...
   } as const;
   ```
2. **Helper**: `expandMenuTokens(label: string, ctx: TokenContext): string` — iterates the registry.
3. Replace the inline `String.replace` in `menu.store.ts` with a call to the helper.
4. Spec: `menu-tokens.spec.ts` — verifies `@VERSION@` and unknown-token passthrough.
5. Document in `MENU.md`.

### Out-of-scope

- Internationalized version strings.
- Server-side token expansion.

---

## 19. Verification checklist

Each workstream is considered done only when:

- [ ] Code compiles cleanly via `npx tsc --noEmit -p libs/cms/<domain>/<layer>/tsconfig.json` for every affected layer.
- [ ] Affected libs build: `pnpm nx affected --target=build`.
- [ ] Affected lint: `pnpm nx affected --target=lint` passes.
- [ ] New/changed code has unit tests in `*.spec.ts` siblings (mandatory for util functions per CLAUDE.md, recommended elsewhere).
- [ ] `pnpm run testlibs` passes.
- [ ] Manual smoke test of the relevant view in the dev app.
- [ ] No stray build artefacts (`*.d.ts`, `*.js`, `*.js.map`) in `libs/` or `apps/*/src/`.

---

## 20. Risk and mitigation

| Risk | Likelihood | Impact | Mitigation |
| :---- | :---- | :---- | :---- |
| Schema changes (RAG config, possibly Files/Links) break existing data | Med | High | Default values for new fields; per CLAUDE.md, requires explicit user approval before any `shared-models` change |
| Adding Vest to `SectionForm` causes false-positive invalidation on legacy sections | Med | Med | Lenient initial rules; gate new rules behind feature flag during rollout |
| Pagination changes break Firestore query patterns elsewhere | Low | Med | Add only to specific lists; keep `list()` returning everything |
| Reindex script slow or partial on large tenants | Low | Med | Run in batches of 500; idempotent |
| Skeleton flicker on fast networks | Low | Low | Show skeleton only if `isLoading()` is true after 100ms |

---

## 21. Open questions

- **§7 Files/Links**: Path A (implement) or Path B (remove)? Default to remove unless product owner objects.
- **§15 RAG**: Does `RagConfig` need schema extension? If yes, requires user approval per CLAUDE.md hard rules.
- **§14 Search**: Is German+English stop word list sufficient, or do we need Italian/French for some tenants?
- **§10 Pagination**: Confirm `SectionAllList` is admin-only or also user-facing. If admin-only, pagination is lower priority.

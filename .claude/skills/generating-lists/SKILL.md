---
name: generating-lists
description: Use when creating or scaffolding a new feature list view (FEATURE-list.ts) — a smart list component with a header toolbar, filters, list/grid content, and per-item ActionSheet actions. Covers header counts, context-menu popover, listId, bk-list-filter, responsiveness, avatars, dark/light styling, and view toggles.
---

# Generating Lists

## Overview

A list view is the `FEATURE-list.ts` smart component in a feature lib. It injects the
feature store, renders a header toolbar + `bk-list-filter` + data, and dispatches both
**list-level actions** (popover context menu) and **per-item actions** (ActionSheet).

**Primary example: [calevent-list.ts](../../../libs/calevent/feature/src/lib/calevent-list.ts)** (ignore its quick-entry toolbar).
Other references: [person-list.ts](../../../libs/subject/person/feature/src/lib/person-list.ts) (avatars + responsiveness),
[resource-list.ts](../../../libs/resource/feature/src/lib/resource-list.ts) and
[document-list.ts](../../../libs/document/feature/src/lib/document-list.ts) (`listId`, view toggle).

## Ask the user first

Before scaffolding, confirm these choices (each maps to a section below):

1. **List-level actions** — which context-menu items? (e.g. `add`, `exportRaw`, …) Skip the popover if none.
2. **listId?** — does the list need a preset filter input (calendar name, `f:folderKey`, `t:tag`)? Default: no.
3. **Filters** — which `bk-list-filter` outputs to wire: `searchTermChanged` (always), `tagChanged`, `typeChanged`, `yearChanged`?
4. **Layout** — `ion-list` (recommended for simple single-line rows) or `ion-grid` (multi-column, responsive sizing)?
5. **Responsiveness** — which columns/labels hide on small screens (`ion-hide-sm-down` / `ion-hide-md-down`)?
6. **View toggle?** — does it need list/grid, calendar/list, or map/list? Default: no.
7. **Toolbar color** — top-level list: static `color="secondary"` (default). Only make it a `color` input if the list is embedded and a parent varies the color (see §9 — a bound `[color]` on a top-level toolbar renders white).

## Steps

1. Read the primary example and the closest sibling list for the same domain.
2. Generate `FEATURE-list.ts` from the building blocks below.
3. Wire i18n via the store (**REQUIRED: use the `i18n` skill** — keys in `util`, resolved in the store, read as `store.i18n.key()`).
4. Add a route for the `*.list` component (see CLAUDE.md routing rules; ask about guard permissions).
5. Run `npx tsc --noEmit -p libs/<domain>/feature/tsconfig.json` before reporting done.

## Building blocks

### Component shell

```ts
@Component({
  selector: 'bk-feature-list',
  standalone: true,
  imports: [
    SvgIconPipe, Spinner, EmptyList, ListFilter, Menu,           // + AvatarPipe / AvatarDisplay if needed
    IonHeader, IonToolbar, IonButtons, IonButton, IonTitle, IonMenuButton, IonIcon,
    IonContent, IonList, IonItem, IonLabel, IonPopover,          // + IonGrid, IonRow, IonCol for grid layout
  ],
  providers: [FeatureStore],
  template: `…`,
})
export class FeatureList {
  protected readonly store = inject(FeatureStore);
  private readonly actionSheetController = inject(ActionSheetController);
  private readonly imgixBaseUrl = this.store.appStore.env.services.imgixBaseUrl;

  // inputs (see listId / styling sections)
  public readonly contextMenuName = input.required<string>();

  // derived
  protected count = computed(() => this.store.featuresCount());
  protected filtered = computed(() => this.store.filteredFeatures() ?? []);
  protected filteredCount = computed(() => this.filtered().length);
  protected isLoading = computed(() => this.store.isLoading());
  protected readonly currentUser = computed(() => this.store.appStore.currentUser());
  protected readOnly = computed(() => !hasRole('memberAdmin', this.currentUser()));
  protected readonly tags = computed(() => this.store.getTags());
}
```

### 1. Header toolbar — title with counts + list-level actions

Title shows `filtered/total` + the plural name. The menu button is optional (hide it for
group/embedded views via `showMenuButton`). List-level actions live in a popover that
renders `bk-menu`; selections are handled in `onPopoverDismiss`.

```html
<ion-header>
  <ion-toolbar [color]="color()">
    @if(showMenuButton()) {
      <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
    }
    <ion-title>{{ filteredCount() }}/{{ count() }} {{ store.i18n.features() }}</ion-title>
    @if(canChange()) {
      <ion-buttons slot="end">
        <ion-button id="{{ popupId() }}">
          <ion-icon slot="icon-only" src="{{ 'menu' | svgIcon }}" />
        </ion-button>
        <ion-popover trigger="{{ popupId() }}" triggerAction="click" [showBackdrop]="true"
          [dismissOnSelect]="true" (ionPopoverDidDismiss)="onPopoverDismiss($event)">
          <ng-template>
            <ion-content><bk-menu [menuName]="contextMenuName()" /></ion-content>
          </ng-template>
        </ion-popover>
      </ion-buttons>
    }
  </ion-toolbar>
  …filters + list header…
</ion-header>
```

```ts
protected popupId = computed(() => `c_features_${this.listId()}`);  // or a random/static id

public async onPopoverDismiss($event: CustomEvent): Promise<void> {
  switch ($event.detail.data) {
    case 'add':       await this.store.add(this.readOnly()); break;
    case 'exportRaw': await this.store.export('raw'); break;
    default: this.alertService.error(`FeatureList.onPopoverDismiss: unknown method ${$event.detail.data}`);
  }
}
```

To **disable the whole header toolbar** (embedded views), guard it with
`@if(contextMenuName() !== 'disable')` as calevent-list does.

### 2. listId (optional)

A preset filter passed by the route/parent. Push it into the store via an `effect`.

```ts
public readonly listId = input.required<string>();   // e.g. calendar name, 'all', 'f:folderKey', 't:tag'
constructor() {
  effect(() => this.store.setListId(this.listId()));  // or store.setConfig(...) / setCalendarName(...)
}
```

### 3. Filters — `bk-list-filter`

Wire only the outputs you need (ask the user). `searchTermChanged` is standard; the others
are opt-in. `[tags]`/`[types]`/`[years]` feed the filter dropdowns.

```html
<bk-list-filter
  (searchTermChanged)="store.setSearchTerm($event)"
  (tagChanged)="store.setSelectedTag($event)"   [tags]="tags()"
  (typeChanged)="store.setSelectedType($event)" [types]="types()"
  (yearChanged)="store.setSelectedYear($event)" [years]="years()"
/>
```

For a view toggle, `bk-list-filter` also takes `[initialView]`, `(viewToggleChanged)`, and `gridIcon` (see section 7).

### 4. List header with sorting

A `light` toolbar with column labels. Hide secondary columns on small screens. Make a header
clickable to sort by calling a store setter:

```html
<ion-toolbar color="light" class="ion-hide-sm-down">
  <ion-grid>
    <ion-row>
      <ion-col size="6" size-md="4" (click)="store.setSort('name')">
        <ion-label><strong>{{ store.i18n.name() }}</strong></ion-label>
      </ion-col>
      <ion-col size="3" class="ion-hide-md-down" (click)="store.setSort('location')">
        <ion-label><strong>{{ store.i18n.location() }}</strong></ion-label>
      </ion-col>
    </ion-row>
  </ion-grid>
</ion-toolbar>
```

### 5. Content — loading, empty, data

Spinner while loading, `bk-empty-list` when empty, otherwise the rows. Each row taps into
the per-item ActionSheet via `(click)="showActions(item)"`.

```html
<ion-content #content>
  @if(isLoading()) {
    <bk-spinner />
  } @else if(filteredCount() === 0) {
    <bk-empty-list [message]="store.i18n.empty()" />
  } @else {
    <!-- layout: ion-list OR ion-grid (section 6) -->
  }
</ion-content>
```

`bk-spinner` is the skeleton/loading indicator from `@bk2/shared-ui`. (Some lists leave the
`@if(isLoading())` branch empty and rely on Ionic's own skeletons — prefer `bk-spinner` for new lists.)

### 6. Layout — `ion-list` vs `ion-grid`

**Recommend `ion-list`** for simple single-line rows (label + optional avatar/chip).
Use **`ion-grid`** when you need multiple responsive columns that align with the list header.

```html
<!-- ion-list (recommended for simple rows) -->
<ion-list lines="inset">
  @for(item of filtered(); track item.bkey) {
    <ion-item button [detail]="false" (click)="showActions(item)">
      <ion-label>
        <h2>{{ item.name }}</h2>
        <p class="ion-hide-sm-down">{{ item.subtitle }}</p>
      </ion-label>
      <ion-chip slot="end" color="medium">{{ item.kind }}</ion-chip>
    </ion-item>
  }
</ion-list>

<!-- ion-grid (multi-column, columns match the list header) -->
<ion-grid>
  @for(item of filtered(); track item.bkey) {
    <ion-row (click)="showActions(item)">
      <ion-col size="6" size-md="4"><ion-label>{{ item.name }}</ion-label></ion-col>
      <ion-col size="3" class="ion-hide-md-down"><ion-label>{{ item.location }}</ion-label></ion-col>
    </ion-row>
  }
</ion-grid>
```

### 6b. Per-item actions — ActionSheet pattern

Split into **three methods** — `showActions` (orchestrates), `addActionSheetButtons`
(builds buttons, gated by permission), `executeActions` (presents + dispatches). This mirrors
[form-definition-list.ts](../../../libs/forms/feature/src/lib/form-definition-list.ts) and person/calevent lists.

```ts
protected async showActions(item: FeatureModel): Promise<void> {
  const options = createActionSheetOptions(this.store.i18n.as_title());
  this.addActionSheetButtons(options, item);
  await this.executeActions(options, item);
}

private addActionSheetButtons(options: ActionSheetOptions, item: FeatureModel): void {
  if (this.readOnly()) {
    options.buttons.push(createActionSheetButton('feature.view', this.store.i18n.view(), this.imgixBaseUrl, 'eye-on'));
  } else {
    options.buttons.push(createActionSheetButton('feature.edit', this.store.i18n.update(), this.imgixBaseUrl, 'edit'));
    if (this.hasRole('admin')) {
      options.buttons.push(createActionSheetButton('feature.delete', this.store.i18n.delete(), this.imgixBaseUrl, 'trash'));
    }
  }
  options.buttons.push(createActionSheetDivider());
  // conditional / contextual actions here …
  options.buttons.push(createActionSheetButton('cancel', this.store.i18n.cancel(), this.imgixBaseUrl, 'cancel'));
  if (options.buttons.length === 1) options.buttons = [];   // only cancel → show nothing
}

private async executeActions(options: ActionSheetOptions, item: FeatureModel): Promise<void> {
  if (options.buttons.length === 0) return;
  const actionSheet = await this.actionSheetController.create(options);
  await actionSheet.present();
  const { data } = await actionSheet.onDidDismiss();
  if (!data) return;
  switch (data.action) {
    case 'feature.view':   await this.store.edit(item, true); break;
    case 'feature.edit':   await this.store.edit(item, this.readOnly()); break;
    case 'feature.delete': await this.store.delete(item, this.readOnly()); break;
  }
}
```

Helpers from `@bk2/shared-util-angular`: `createActionSheetOptions`, `createActionSheetButton`,
`createActionSheetDivider`. The button `name` ending in `delete`/`cancel` auto-sets the
destructive/cancel role.

### 7. i18n

**REQUIRED: use the `i18n` skill.** i18n is store-driven: keys live in the feature's `util`
(`FEATURE_I18N_KEYS` + `FeatureI18n` type), the store resolves them once
(`i18n: store.i18nService.translateAll(FEATURE_I18N_KEYS)`), and the template reads
`store.i18n.key()`. List views need at least: plural name, `empty`, `as_title`, and the
per-action labels (`update`, `delete`, `view`, `cancel`, …). Never use `TranslatePipe` for static keys.

### 8. Responsiveness

Hide longer / less-important columns on smaller screens with Ionic display utility classes —
ask the user which to hide. From [person-list.ts](../../../libs/subject/person/feature/src/lib/person-list.ts):

- `class="ion-hide-sm-down"` — hide below `sm` (e.g. phone column).
- `class="ion-hide-md-down"` — hide below `md` (e.g. email / location / responsible column).

Apply the **same class to the list-header column and its data cell** so they stay aligned.
For filter dropdowns you can also drop a `type` filter on narrow screens by returning
`undefined` from the `types()` computed when `window.innerWidth < SIZE_MD`.

### 9. Styling

- **Toolbar color**: header toolbar is `secondary`, the list-header toolbar is `light`.
  - **Top-level list (its own route): use the static attribute** `<ion-toolbar color="secondary">`.
    A dynamic `[color]="color()"` on a top-level route can render **white** — Ionic applies the
    `ion-color-*` class when it reads the `color` *attribute* at element upgrade, and a bound
    property isn't reliably picked up, so the toolbar falls back to the default background.
  - **Embedded / reusable list** (rendered by a parent that varies the color): then add
    `public color = input('secondary');` and bind `[color]="color()"` — the parent passes a concrete value.
- **Dark / light**: rely on Ionic theme variables (`var(--ion-color-light)` etc.) — don't
  hard-code colors. Avatar placeholders use `background-color: var(--ion-color-light)`.
- **View toggle** (optional, ask): list/grid, calendar/list, map/list. Drive it from
  `bk-list-filter`'s `[initialView]` + `(viewToggleChanged)` and a `linkedSignal`:
  ```ts
  public view = input<'list' | 'grid'>('list');
  protected isListView = linkedSignal(() => this.view() === 'list');
  protected onViewChange(showList: boolean): void { this.isListView.set(showList); }
  ```
  Then `@if(isListView()) { …list… } @else { …grid/calendar/map… }`.
- **Avatars** for persons / orgs / resources — use the `avatar` pipe (`@bk2/avatar-ui`):
  ```html
  <ion-avatar slot="start">
    <ion-img src="{{ 'person.' + person.bkey | avatar:'person' }}" alt="Avatar" />
  </ion-avatar>
  ```
  with `ion-avatar { width: 30px; height: 30px; background-color: var(--ion-color-light); }`.
  For a **set** of avatars (e.g. responsible persons) use `<bk-avatar-display [avatars]="item.responsiblePersons" />` (`AvatarDisplay`).

## Common mistakes

- Per-item action **buttons inline on the row** instead of the ActionSheet pattern → use `showActions`.
- Hiding a data column but **not** the matching header column (or vice-versa) → misaligned columns.
- `TranslatePipe`/`AsyncPipe` for static labels → use the store-driven i18n pattern.
- Forgetting the `if (options.buttons.length === 1) options.buttons = []` guard → an empty ActionSheet with only Cancel pops up.
- Hard-coding colors instead of Ionic theme variables → breaks dark mode.
- Binding `[color]="color()"` on a **top-level** list toolbar → renders white; use the static `color="secondary"` attribute (reserve the bound form for embedded lists).
- Adding a route only for the `*.page`/detail and not for the `*.list` (see CLAUDE.md).

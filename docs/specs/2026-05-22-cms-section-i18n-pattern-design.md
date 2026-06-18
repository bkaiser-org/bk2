# Design: Fix i18n Pattern in cms/section/feature

Date: 2026-05-22

## Goal

Ensure all components in `libs/cms/section/feature` follow the store-driven i18n pattern defined in CLAUDE.md: static i18n keys are resolved once via `I18nService.translateAll` in a store's `withProps`, and components read resolved signals from the store.

## Audit Findings

### Already correct (no changes needed)

| File | Reason |
|---|---|
| `accordion-section.ts` | `TranslatePipe` for `item.label` — DB-driven key, valid exception |
| `events-section.ts` | `TranslatePipe` for `weekday` pipe result — runtime-dynamic key from event data, valid exception |
| `button-section.ts` | `i18nService.translate()` with `{ name }` param — dynamic params in imperative code, valid exception |
| `context-diagram-config.modal.ts` | Inline store with `withProps` + `translateAll` |
| `missing-section.ts` | Inline store with `withProps` + `translateAll` |
| `message-center.modal.ts` | Inline store with `withProps` + `translateAll` |
| `section-preview.modal.ts` | Inline store with `withProps` + `translateAll` |
| `table-section.ts` | Inline store with `withProps` + `translateAll` |
| All store-backed sections | Store already provides `i18n` object |

### Files to fix

#### 1. `accordion-item.ts` (AccordionItemContentComponent)

**Problem:** Injects `I18nService` directly in the component for a static key `@shared/ui.copy.conf`.

```ts
private readonly i18nService = inject(I18nService);
private readonly copyI18n = this.i18nService.translateAll({ copy_conf: '@shared/ui.copy.conf' });
```

**Fix:**
- Add `copy_conf: '@shared/ui.copy.conf'` to `SECTION_I18N_KEYS` in `section.store.ts`
- In `AccordionItemContentComponent`: remove `I18nService` injection and `copyI18n` field; change `buttonCopyI18n` to use `store.i18n.copy_conf()`

#### 2. `section-dispatcher.ts` (SectionDispatcher)

**Problem:** Injects `I18nService` directly in a component with no store, for the same static key.

```ts
private readonly i18nService = inject(I18nService);
private readonly copyI18n = this.i18nService.translateAll({ copy_conf: '@shared/ui.copy.conf' });
```

**Fix:**
- Create an inline `SectionDispatcherStore` above the class:
  ```ts
  const SectionDispatcherStore = signalStore(
    withProps(() => ({ i18nService: inject(I18nService) })),
    withProps(store => ({
      i18n: store.i18nService.translateAll({ copy_conf: '@shared/ui.copy.conf' }),
    })),
  );
  ```
- Add `providers: [SectionDispatcherStore]` to `@Component`
- Inject the store in the class; remove `I18nService` injection
- Change `buttonCopyI18n` to use `store.i18n.copy_conf()`

#### 3. `card-select.modal.ts` (CardSelectModal)

**Problem:** Uses `computed(() => i18nService.translateAll(...))` — calling `toSignal` (inside `translateAll`) in a lazy computed callback runs outside injection context, which is a runtime bug. Also has 3 unused keys (`cancel`, `ok`, `cardTitle`) never referenced in the template.

```ts
protected i18n = computed(() => {          // BUG: toSignal not valid here
  return this.i18nService.translateAll({
    headerTitle: PFX + 'select.' + this.slug(),   // dynamic — depends on input
    cardTitle:   PFX + this.items.name + '.label', // unused
    cancel:      '@cancel',                         // unused
    ok:          '@ok',                             // unused
  })
});
```

**Fix:**
- Create an inline `CardSelectStore` with `withState({ slug: '' })`, `I18nService` in `withProps`, and `headerTitle` resolved reactively in `withComputed` using `toSignal` + `switchMap`:
  ```ts
  const CardSelectStore = signalStore(
    withState({ slug: '' }),
    withProps(() => ({ i18nService: inject(I18nService) })),
    withComputed(store => ({
      headerTitle: toSignal(
        toObservable(computed(() => PFX + 'select.' + store.slug())).pipe(
          switchMap(key => store.i18nService.translate(key))
        ),
        { initialValue: '' }
      )
    }))
  );
  ```
- Add `providers: [CardSelectStore]` to `@Component`
- Inject store; add `effect(() => patchState(this.store, { slug: this.slug() }))` to sync input
- Remove `I18nService` injection and broken `i18n` computed
- Template: `<bk-header [i18n]="{ title: store.headerTitle() }" [isModal]="true" />`

## Data Flow

```
SectionStore.SECTION_I18N_KEYS (adds copy_conf)
  └── AccordionItemContentComponent.store.i18n.copy_conf()
        └── buttonCopyI18n() → TrackerSectionComponent

SectionDispatcherStore (new inline store, copy_conf only)
  └── SectionDispatcher.store.i18n.copy_conf()
        └── buttonCopyI18n() → TrackerSectionComponent

CardSelectStore (new inline store, dynamic headerTitle)
  └── slug input → patchState → store.slug()
        └── toSignal(switchMap) → store.headerTitle()
              └── bk-header [i18n].title
```

## Files Changed

1. `libs/cms/section/feature/src/lib/section.store.ts` — add `copy_conf` key
2. `libs/cms/section/feature/src/lib/accordion-item.ts` — remove `I18nService`, use store
3. `libs/cms/section/feature/src/lib/section-dispatcher.ts` — add inline store, remove `I18nService`
4. `libs/cms/section/feature/src/lib/card-select.modal.ts` — replace broken computed with inline store

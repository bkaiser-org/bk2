# cms/section/feature i18n Pattern Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix three files in `libs/cms/section/feature` that violate the store-driven i18n pattern — either injecting `I18nService` directly in components or wrapping `translateAll` in a broken `computed()`.

**Architecture:** Static i18n keys belong in a store's `withProps` via `I18nService.translateAll`. Components read resolved signals from the store. For `accordion-item.ts` the existing `SectionStore` gains a new key. For `section-dispatcher.ts` and `card-select.modal.ts` small inline stores are added above the `@Component` decorator. The dynamic slug-based key in `card-select.modal.ts` uses `toSignal` + `switchMap` in `withComputed`, which runs inside the injection context.

**Tech Stack:** Angular 20 (signals, zoneless), NgRx Signal Store (`@ngrx/signals`), Transloco via `I18nService` (`@bk2/shared-i18n`), TypeScript strict.

---

### Task 1: Add `copy_conf` key to `SectionStore`

**Files:**
- Modify: `libs/cms/section/feature/src/lib/section.store.ts:25-67`

- [ ] **Step 1: Add `copy_conf` to `SECTION_I18N_KEYS`**

In `section.store.ts`, in the `SECTION_I18N_KEYS` object (line ~25), add the new entry after `changeConfirmation_confirmation`:

```ts
const SECTION_I18N_KEYS = {
  // ... existing keys unchanged ...
  changeConfirmation_ok:           PFX + 'changeConfirmation.ok',
  changeConfirmation_cancel:       PFX + 'changeConfirmation.cancel',
  changeConfirmation_confirmation: PFX + 'changeConfirmation.confirmation',
  copy_conf:                       '@shared/ui.copy.conf',
} satisfies Record<string, string>;
```

The `SectionI18n` type on line 69 is derived automatically:
```ts
export type SectionI18n = { [K in keyof typeof SECTION_I18N_KEYS]: Signal<string> };
```
No further change needed — `copy_conf` is now part of the type.

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit -p libs/cms/section/feature/tsconfig.json
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add libs/cms/section/feature/src/lib/section.store.ts
git commit -m "refactor(cms-section): add copy_conf i18n key to SectionStore"
```

---

### Task 2: Fix `accordion-item.ts` — use SectionStore for `copy_conf`

**Files:**
- Modify: `libs/cms/section/feature/src/lib/accordion-item.ts`

- [ ] **Step 1: Remove `I18nService` injection and use store key**

Replace the current class body:

```ts
// BEFORE (lines ~72-75):
private readonly i18nService = inject(I18nService);
private readonly copyI18n = this.i18nService.translateAll({ copy_conf: '@shared/ui.copy.conf' });
protected readonly buttonCopyI18n = computed(() => ({ copy_conf: this.copyI18n.copy_conf() } as ButtonCopyI18n));
```

With:

```ts
// AFTER:
protected readonly buttonCopyI18n = computed(() => ({ copy_conf: this.store.i18n.copy_conf() } as ButtonCopyI18n));
```

- [ ] **Step 2: Remove unused `I18nService` import**

Remove from the imports at the top of the file:
```ts
import { I18nService } from '@bk2/shared-i18n';
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit -p libs/cms/section/feature/tsconfig.json
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add libs/cms/section/feature/src/lib/accordion-item.ts
git commit -m "refactor(cms-section): remove I18nService from AccordionItemContentComponent, use SectionStore"
```

---

### Task 3: Fix `section-dispatcher.ts` — add inline store for `copy_conf`

**Files:**
- Modify: `libs/cms/section/feature/src/lib/section-dispatcher.ts`

- [ ] **Step 1: Add NgRx Signal Store imports**

The file currently imports `I18nService` but not NgRx store functions. Update the import block at the top of the file. Add to existing imports:

```ts
import { patchState, signalStore, withProps } from '@ngrx/signals';
```

- [ ] **Step 2: Add the inline store above `@Component`**

Insert this block directly above the `@Component` decorator (before line ~41):

```ts
const SectionDispatcherStore = signalStore(
  withProps(() => ({ i18nService: inject(I18nService) })),
  withProps(store => ({
    i18n: store.i18nService.translateAll({ copy_conf: '@shared/ui.copy.conf' }),
  })),
);
```

- [ ] **Step 3: Update `@Component` decorator to provide the store**

Add `providers` to the `@Component` decorator:

```ts
@Component({
  selector: 'bk-section-dispatcher',
  standalone: true,
  providers: [SectionDispatcherStore],
  imports: [
    // ... existing imports unchanged ...
  ],
  // ... template unchanged ...
})
```

- [ ] **Step 4: Update the class body**

Replace:

```ts
// BEFORE:
export class SectionDispatcher {
  private readonly i18nService = inject(I18nService);
  private readonly copyI18n = this.i18nService.translateAll({ copy_conf: '@shared/ui.copy.conf' });
  protected readonly buttonCopyI18n = computed(() => ({ copy_conf: this.copyI18n.copy_conf() } as ButtonCopyI18n));
```

With:

```ts
// AFTER:
export class SectionDispatcher {
  private readonly store = inject(SectionDispatcherStore);
  protected readonly buttonCopyI18n = computed(() => ({ copy_conf: this.store.i18n.copy_conf() } as ButtonCopyI18n));
```

- [ ] **Step 5: Verify `I18nService` import is retained**

`I18nService` is still referenced by the inline `SectionDispatcherStore` — do NOT remove that import. Confirm it remains at the top of the file:

```ts
import { I18nService } from '@bk2/shared-i18n';
```

- [ ] **Step 6: Type-check**

```bash
npx tsc --noEmit -p libs/cms/section/feature/tsconfig.json
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add libs/cms/section/feature/src/lib/section-dispatcher.ts
git commit -m "refactor(cms-section): replace I18nService injection in SectionDispatcher with inline store"
```

---

### Task 4: Fix `card-select.modal.ts` — replace broken `computed(translateAll)` with inline store

**Files:**
- Modify: `libs/cms/section/feature/src/lib/card-select.modal.ts`

**Context:** The current `computed(() => this.i18nService.translateAll(...))` is a runtime bug — `toSignal` (called inside `translateAll`) requires an injection context, but `computed()` callbacks execute lazily, outside that context. The `headerTitle` key is dynamic (depends on the `slug` input), so it cannot use the simple `translateAll` pattern. Instead, use `toSignal` + `switchMap` inside `withComputed`, which runs during store initialization (injection context).

- [ ] **Step 1: Update imports**

Replace the current imports at the top of the file with:

```ts
import { Component, computed, effect, inject, input } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonCol, IonContent, IonGrid, IonImg, IonRow, ModalController } from '@ionic/angular/standalone';
import { switchMap } from 'rxjs/operators';

import { CategoryItemModel, CategoryListModel } from '@bk2/shared-models';
import { ENV } from '@bk2/shared-config';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { I18nService } from '@bk2/shared-i18n';
import { Header } from '@bk2/shared-ui';
import { patchState, signalStore, withComputed, withProps, withState } from '@ngrx/signals';

import { PFX } from './scope';
```

- [ ] **Step 2: Add the inline store above `@Component`**

Insert this block directly above the `@Component` decorator:

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
    ),
  })),
);
```

- [ ] **Step 3: Update `@Component` decorator to provide the store**

Add `providers` to the `@Component` decorator:

```ts
@Component({
  selector: 'bk-card-select-modal',
  standalone: true,
  providers: [CardSelectStore],
  imports: [
    SvgIconPipe,
    Header,
    IonContent, IonGrid, IonRow, IonCol, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCardSubtitle, IonImg
  ],
  // ... styles unchanged ...
  template: `
    @if(slug()) {
      <bk-header [i18n]="{ title: store.headerTitle() }" [isModal]="true" />
      <ion-content>
        <ion-grid>
          <ion-row>
            @for(item of items(); track $index) {
              <ion-col size="6" size-md="3">
                <ion-card (click)="select(item)">
                  <ion-card-header>
                    <ion-card-title>{{ '@' + i18nBase() + '.' + item.name + '.label' }}</ion-card-title>
                    <ion-card-subtitle>{{ item.name }}</ion-card-subtitle>
                  </ion-card-header>
                  <ion-card-content>
                    <ion-img src="{{ item.name | svgIcon:'section' }}" alt="{{ item.name }}" />
                  </ion-card-content>
                </ion-card>
              </ion-col>
            }
          </ion-row>
        </ion-grid>
      </ion-content>
    }
  `,
})
```

- [ ] **Step 4: Replace the class body**

Replace the entire class body with:

```ts
export class CardSelectModal {
  protected readonly store = inject(CardSelectStore);
  private readonly env = inject(ENV);
  private readonly modalController = inject(ModalController);

  // inputs
  public category = input.required<CategoryListModel>();
  public slug = input.required<string>();

  // computed
  protected i18nBase = computed(() => this.category().i18nBase);
  protected items = computed(() => this.category().items);
  protected path = computed(() => `${this.env.services.imgixBaseUrl}/logo/${this.slug()}/`);

  constructor() {
    effect(() => patchState(this.store, { slug: this.slug() }));
  }

  public async select(item: CategoryItemModel): Promise<boolean> {
    return await this.modalController.dismiss(item, 'confirm');
  }
}
```

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit -p libs/cms/section/feature/tsconfig.json
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add libs/cms/section/feature/src/lib/card-select.modal.ts
git commit -m "refactor(cms-section): replace broken computed(translateAll) in CardSelectModal with inline store"
```

---

### Task 5: Final type-check across affected libs

- [ ] **Step 1: Type-check the full section feature lib**

```bash
npx tsc --noEmit -p libs/cms/section/feature/tsconfig.json
```

Expected: no errors.

- [ ] **Step 2: Type-check shared-i18n (not modified, sanity check)**

```bash
npx tsc --noEmit -p libs/shared/i18n/tsconfig.json
```

Expected: no errors.

---
name: building-forms
description: Use when building, scaffolding, or editing a form — a `FEATURE.form.ts` ui component or a form configured by the form-builder. Covers Angular Signal Forms, Vest validation (form + field), shared/ui field primitives, valid/dirty outputs, no submit button (parent modal/page drives saving via change-confirmation), i18n wiring, autofocus/tab order, the ion-card + ion-grid responsive layout, and guarded bk-chips/bk-notes-input at the end.
---

# Building Forms

## Overview

Every form in this app — whether a **prebuilt pure component** (`FEATURE.form.ts` in a `ui`
lib) or a form **configured by the user with the form-builder** — follows the **same
principles**: a dumb, presentational component wrapping a `model` with **Angular Signal
Forms** + **Vest** validation, emitting `valid`/`dirty`, with **no submit button**. The parent
(an edit modal or a page) owns persistence and shows the **change-confirmation** banner.

**Canonical example — copy it:** the `folder` form.
- form: [folder.form.ts](../../../libs/folder/ui/src/lib/folder.form.ts)
- validations: [folder.validations.ts](../../../libs/folder/util/src/lib/folder.validations.ts)
- parent modal: [folder-edit.modal.ts](../../../libs/folder/feature/src/lib/folder-edit.modal.ts)

Richer field mix (categories, url, icon, guarded chips/notes, conditional rows):
[menu.form.ts](../../../libs/cms/menu/ui/src/lib/menu.form.ts).

## Non-negotiable rules

1. **Angular Signal Forms only.** Build the form with `form(this.formData, (path) =>
   validateVestTree(path, FEATUREValidations))`. Do **NOT** use `ngx-vest-forms` /
   `scVestForm` / `validationConfig` (removed). `form` is from `@angular/forms/signals`;
   `validateVestTree` from `@bk2/shared-util-angular`.
2. **No submit button in the form.** Saving is driven by the parent via `bk-change-confirmation`.
3. **Use shared/ui field primitives** — never raw `ion-input`. See the catalog below.
4. **Emit `valid` and `dirty`** as outputs; the parent wires them to the banner.
5. **i18n is store-driven** — the form receives a resolved `[i18n]` object input; build per-field
   `*I18n` objects with `computed`. Never `TranslatePipe` for static keys. See the `i18n` skill.
6. **Layout:** `<ion-card><ion-card-content class="ion-no-padding"><ion-grid>` with responsive
   `<ion-col size="12" size-md="6">` (full width on mobile, two-up on md+).
7. **Guarded chips + notes at the end** — `bk-chips` (tags) then `bk-notes-input`, each wrapped
   in a role guard (e.g. `@if (hasRole('contentAdmin'))`).
8. **Focus & tab order** — set `[autofocus]="true"` on the first field. Primitives already
   neutralise the Ionic clear-button so Tab walks field→field (don't re-solve that).

## The form component (ui lib)

```ts
@Component({
  selector: 'bk-FEATURE-form',
  standalone: true,
  imports: [TextInput, NotesInput, Chips, IonGrid, IonRow, IonCol, IonCard, IonCardContent],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    @if (showForm()) {
      <form novalidate>
        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-grid>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <bk-text-input [i18n]="nameI18n()" [value]="name()"
                    (valueChange)="onFieldChange('name', $event)"
                    [autofocus]="true" [maxLength]="50" [readOnly]="isReadOnly()" />
                  <bk-error-note [errors]="nameErrors()" />
                </ion-col>
              </ion-row>
              <!-- …more rows/cols of primitives… -->
            </ion-grid>
          </ion-card-content>
        </ion-card>

        <!-- guarded, always last -->
        @if (hasRole('contentAdmin')) {
          <bk-chips chipName="tag" [storedChips]="tags()"
            (storedChipsChange)="onFieldChange('tags', $event)"
            [allChips]="allTags()" [readOnly]="isReadOnly()" />
        }
        @if (hasRole('contentAdmin')) {
          <bk-notes-input [i18n]="descriptionI18n()" [value]="description()"
            (valueChange)="onFieldChange('description', $event)" [readOnly]="isReadOnly()" />
        }
      </form>
    }
  `,
})
export class FeatureForm {
  // inputs
  public readonly i18n = input.required<FeatureI18n>();
  public formData = model.required<FeatureModel>();
  public readonly currentUser = input<UserModel | undefined>();
  public readonly tenantId = input.required<string>();
  public readonly allTags = input(DEFAULT_TAGS);
  public readonly readOnly = input(true);
  public readonly showForm = input(true); // toggled by parent to reset Vest state on cancel

  // outputs
  public readonly dirty = output<boolean>();
  public readonly valid = output<boolean>();

  // signal form — wraps formData with Vest validation
  protected readonly featureForm = form(this.formData, (path) =>
    validateVestTree(path, featureValidations as any));

  constructor() { effect(() => this.valid.emit(this.featureForm().valid())); }

  // field accessors + per-field i18n via computed(); errors via the vest result
  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected readonly name = computed(() => this.formData()?.name ?? '');
  protected nameI18n = computed(() => ({ name: 'name', label: this.i18n().name_label(),
    placeholder: this.i18n().name_placeholder(), helper: this.i18n().name_helper() } as TextInputI18n));

  protected onFieldChange(fieldName: string, fieldValue: string | string[] | number): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }

  protected hasRole(role: RoleName): boolean { return hasRole(role, this.currentUser()); }
}
```

Per-field error notes are optional: compute them from the Vest suite result and render
`<bk-error-note [errors]="nameErrors()" />` (see `menu.form.ts`).

## The Vest validation suite (util lib)

`FEATURE.validations.ts` — a `staticSuite`; `only(field)` enables single-field re-validation:

```ts
export const featureValidations = staticSuite(
  (model: FeatureModel, tenants: string, tags: string, field?: string) => {
    if (field) only(field);
    baseValidations(model, tenants, tags, field);          // bkey, tenants, tags, notes…
    stringValidations('name', model.name, SHORT_NAME_LENGTH);
    // …field-specific rules…
  });
```
Reuse the shared building blocks (`baseValidations`, `stringValidations`, etc.) from
`@bk2/shared-util-core`. Add a `FEATURE.validations.spec.ts` (QA rule: test util functions).

## The parent (edit modal or page) — change-confirmation, NOT a submit button

```ts
template: `
  <bk-header [i18n]="{ title: headerTitle() }" [isModal]="true" />
  @if (showConfirmation()) {
    <bk-change-confirmation [i18n]="changeConfirmationI18n()"
      (saveClicked)="save()" (cancelClicked)="cancel()" />
  }
  <ion-content class="ion-no-padding">
    @if (formData(); as formData) {
      <bk-FEATURE-form [formData]="formData" (formDataChange)="onFormDataChange($event)"
        [i18n]="i18n" [currentUser]="currentUser()" [readOnly]="isReadOnly()"
        [showForm]="showForm()" (dirty)="formDirty.set($event)" (valid)="formValid.set($event)" />
    }
  </ion-content>`
```
```ts
protected formDirty = signal(false);
protected formValid = signal(false);
public formData = linkedSignal(() => safeStructuredClone(this.feature()));
protected showForm = signal(true);
protected showConfirmation = computed(() => this.formValid() && this.formDirty());

public async save(): Promise<void> { await this.modalController.dismiss(this.formData(), 'confirm'); }
public cancel(): void {                       // revert + force a fresh form (clears Vest state)
  this.formDirty.set(false);
  this.formData.set(safeStructuredClone(this.feature()));
  this.showForm.set(false);
  setTimeout(() => this.showForm.set(true), 0);
}
```
The banner only appears when **valid AND dirty**. `bk-change-confirmation`
([change-confirmation.ts](../../../libs/shared/ui/src/lib/change-confirmation.ts)) outputs
`saveClicked`/`cancelClicked` and takes `i18n` `{ cancel, save }`. The header's close button
cancels without saving. A page parent uses the same wiring under its own `bk-header`.

## Field-primitive catalog (`@bk2/shared-ui`)

| Primitive | Selector | For |
|---|---|---|
| `TextInput` | `bk-text-input` | strings (supports `[autofocus]`, mask, copy) |
| `NumberInput` | `bk-number-input` | numbers |
| `Checkbox` | `bk-checkbox` | boolean |
| `DateInput` / `TimeInput` | `bk-date-input` / `bk-time-input` | dates / times |
| `NotesInput` | `bk-notes-input` | long text / notes |
| `Chips` | `bk-chips` | tag chips |
| `CategorySelect` | `bk-cat-select` | category enum select |
| `UrlInput` / `IconInput` | `bk-url` / `bk-icon-input` | url / icon name |
| `PhoneInput` / `Email` / `Iban` / `PasswordInput` | `bk-phone` / `bk-email` / `bk-iban` / `bk-password-input` | typed inputs |
| `ErrorNote` | `bk-error-note` | per-field Vest errors |

Each primitive takes `[i18n]`, `[value]`+`(valueChange)`, `[readOnly]`. Check the component
for extra inputs before adding behaviour.

## Form-builder forms

Forms the user assembles in the form-builder render through `FormRenderer`/`FieldRenderer`
([libs/forms](../../../libs/forms)). They share the principles — shared/ui primitives and
per-field validation — with two **deliberate differences** because these are **public
submission forms**, not edit modals:
- They keep their **own submit button** (`FormRenderer`) and own submission; there is **no
  change-confirmation** (no parent modal). The no-submit-button rule is for edit forms only.
- `FieldRenderer` drives a reactive `FormGroup`, so each `bk-*` primitive is **bridged** back
  to its `FormControl` (`[value]`/`(valueChange)` → `control.setValue(...)`). Primitives are
  used where they map cleanly (text, email, iban, phone, password, notes, checkbox); a few
  types stay on raw Ionic controls where a primitive would change the **stored format**
  (date/time store-format) or **required semantics** (number's null-vs-0), plus option-based
  selects and file uploads.

When adding a new builder **field type**, extend `FieldType` + the `Field` union, the palette
(`FIELD_TYPE_DEFS`), `FieldRenderer`, and `validatorsFor`/`defaultFor` together.

## Common mistakes

- **Putting a Save button in the form.** Saving belongs to the parent's change-confirmation.
- **Two-way `[(ngModel)]` into a signal-held object** — mutating in place won't refresh
  computeds (e.g. `valid`/`isValid`). Always go through `onFieldChange` → `formData.update(...)`.
- **Forgetting `showForm` reset on cancel** — Vest keeps stale errors unless you toggle it off/on.
- **Raw `ion-input`/`ion-grid` without the card** — keep `ion-card` + `ion-no-padding` + `size-md`.
- **Unguarded chips/notes** — wrap them in the role guard and keep them last.
- **`TranslatePipe` for static labels** — use the store-driven `[i18n]` objects (see `i18n` skill).
```

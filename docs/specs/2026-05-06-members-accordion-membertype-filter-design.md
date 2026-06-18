# Design: memberType filter in bk-members-accordion

**Date:** 2026-05-06
**Status:** Approved

## Summary

Add a `bk-string-select` to the `bk-members-accordion` header that lets privileged users filter the displayed members by `memberModelType`. Default is `'person'`. Values are `'person' | 'org' | 'group'`.

## Scope

Single file change: `libs/relationship/membership/feature/src/lib/members-accordion.component.ts`

## Design

### State

Add a local `signal` in the component (no store changes):

```ts
protected readonly memberTypes = ['person', 'org', 'group'];
protected selectedMemberType = signal<'person' | 'org' | 'group'>('person');
```

### Filtered list

Replace the existing `members` computed alias with a filtered version:

```ts
protected filteredMembers = computed(() =>
  this.store.members().filter(m => m.memberModelType === this.selectedMemberType())
);
```

The template `@for` loop switches from `members()` to `filteredMembers()`.

### Select placement

Inside the existing header `ion-item`, after the label and before the add button. Only rendered for privileged users:

```html
@if(hasRole('privileged')) {
  <bk-string-select
    name="modelType"
    [stringList]="memberTypes"
    [selectedString]="selectedMemberType()"
    (selectedStringChange)="selectedMemberType.set($event as 'person' | 'org' | 'group')"
    [readOnly]="false" />
}
```

Uses the existing `@input.modelType.label` translation key (`Modelltyp`).

### Imports

Add `StringSelectComponent` from `@bk2/shared-ui` to the component's `imports` array.

## Not in scope

- Store-level filter state
- i18n changes (reuses existing `@input.modelType.label`)
- 'all' option

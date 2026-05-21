# MemberAgeSection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `member-age` section type that reads active members of a configured org and renders an age-distribution table (Altersgruppe / Männer / Frauen / Total, one row per decade, one Total row).

**Architecture:** Follows the existing `activities-section` store+component pattern. A `MemberAgeSectionStore` (NgRx Signal Store) loads memberships via `rxResource`, filters to active members, and computes `AgeRow[]` in a `withComputed`. The component reads from the store, renders an ion-grid table, and delegates config via an effect-driven `setConfig` call. Data model types live in `shared-models`; the section is wired into `section-dispatcher.ts`.

**Tech Stack:** Angular 20 signals, NgRx Signal Stores (`@ngrx/signals`), `rxResource`, `MembershipService` (`@bk2/relationship-membership-data-access`), `I18nService` translateAll pattern, Ionic grid.

---

## File Map

| Action | File |
|--------|------|
| Modify | `libs/shared/models/src/lib/section.model.ts` |
| Modify | `libs/shared/models/src/lib/section.shapes.ts` |
| Modify | `libs/cms/section/feature/src/i18n/de.json` |
| Create | `libs/cms/section/feature/src/lib/member-age-section.store.ts` |
| Create | `libs/cms/section/feature/src/lib/member-age-section.ts` |
| Modify | `libs/cms/section/feature/src/lib/section-dispatcher.ts` |
| Modify | `libs/cms/section/feature/src/index.ts` |

---

## Task 1: Data model — `section.model.ts` and `section.shapes.ts`

**Files:**
- Modify: `libs/shared/models/src/lib/section.model.ts`
- Modify: `libs/shared/models/src/lib/section.shapes.ts`

- [ ] **Step 1: Add `'member-age'` to `SectionType`**

In `section.model.ts`, change the last line of the union:

```ts
// before
    'news' | 'activities' | 'messages' | 'files' | 'links' | 'rag' | 'orgchart' | 'context';

// after
    'news' | 'activities' | 'messages' | 'files' | 'links' | 'rag' | 'orgchart' | 'context' | 'member-age';
```

- [ ] **Step 2: Add `MemberAgeSection` interface and `MemberAgeConfig` interface**

Add these two interfaces directly after the `ContextDiagramSection` + `ContextDiagramConfig` block (around line 61) in `section.model.ts`:

```ts
// --------------------------------------- MEMBER AGE ----------------------------------------
export interface MemberAgeSection extends BaseSection {
  type: 'member-age';
  properties: MemberAgeConfig;
}

export interface MemberAgeConfig {
  orgId: string;
}
```

- [ ] **Step 3: Add `MemberAgeSection` to the `SectionModel` union**

In `section.model.ts`, update the union's last line:

```ts
// before
    NewsSection | ActivitiesSection | MessagesSection | FilesSection | LinksSection | RagSection | OrgchartSection | ContextDiagramSection;

// after
    NewsSection | ActivitiesSection | MessagesSection | FilesSection | LinksSection | RagSection | OrgchartSection | ContextDiagramSection | MemberAgeSection;
```

- [ ] **Step 4: Add `MemberAgeConfig` to `BaseSection.properties?` union**

In `section.model.ts`, update the last line of the `properties?` union:

```ts
// before
  TasksConfig | NewsConfig | ActivitiesConfig | MessagesConfig | FilesConfig | LinksConfig | RagConfig;

// after
  TasksConfig | NewsConfig | ActivitiesConfig | MessagesConfig | FilesConfig | LinksConfig | RagConfig | MemberAgeConfig;
```

- [ ] **Step 5: Add shapes to `section.shapes.ts`**

First, add `MemberAgeConfig` to the type import block at the top of `section.shapes.ts`:

```ts
// find the import from "./section.model" and add MemberAgeConfig to the list
import type {
  AccordionSection, AlbumConfig, AlbumSection, ArticleConfig, ArticleSection,
  AvatarConfig, ButtonConfig, ButtonSection, ButtonStyle, CalendarSection,
  ChartSection, ChatConfig, ChatSection, ContextDiagramConfig, ContextDiagramSection, EditorConfig, EventsConfig, EventsSection,
  HeroConfig, HeroSection, IconConfig, IframeConfig,
  IframeSection, InvitationsConfig, InvitationsSection, MapConfig, MapSection, MemberAgeConfig, OrgchartConfig, OrgchartSection, PeopleConfig,
  PeopleSection, ResponsibilityConfig, ResponsibilitySection, SliderConfig, SliderSection, TableConfig, TableSection,
  TrackerConfig, TrackerSection, VideoConfig, VideoSection
} from "./section.model";
```

Then add shape constants at the end of the file, before the closing line:

```ts
// --------------------------------------- MEMBER AGE ----------------------------------------
export const MEMBER_AGE_CONFIG_SHAPE: MemberAgeConfig = { orgId: '' };
export const MEMBER_AGE_SECTION_SHAPE = {
  ...BASE_SECTION_SHAPE,
  type: 'member-age' as const,
  properties: MEMBER_AGE_CONFIG_SHAPE,
};
```

- [ ] **Step 6: Type-check `shared-models`**

```bash
npx tsc --noEmit -p libs/shared/models/tsconfig.json
```

Expected: zero errors.

- [ ] **Step 7: Commit**

```bash
git add libs/shared/models/src/lib/section.model.ts libs/shared/models/src/lib/section.shapes.ts
git commit -m "feat(shared-models): add MemberAgeSection and MemberAgeConfig types"
```

---

## Task 2: i18n — add German translations

**Files:**
- Modify: `libs/cms/section/feature/src/i18n/de.json`

- [ ] **Step 1: Add `memberAge` block**

In `libs/cms/section/feature/src/i18n/de.json`, insert before the closing `}` of the root object (after line 92 `"changeConfirmation": { ... }`):

```json
  "memberAge": {
    "ageGroup": "Altersgruppe",
    "male": "Männer",
    "female": "Frauen",
    "total": "Total",
    "empty": "Keine aktiven Mitglieder gefunden."
  },
```

Note: add a comma after the preceding block to keep the JSON valid.

- [ ] **Step 2: Commit**

```bash
git add libs/cms/section/feature/src/i18n/de.json
git commit -m "feat(cms-section-feature): add memberAge i18n translations"
```

---

## Task 3: Store — `member-age-section.store.ts`

**Files:**
- Create: `libs/cms/section/feature/src/lib/member-age-section.store.ts`

- [ ] **Step 1: Create the store file**

Create `libs/cms/section/feature/src/lib/member-age-section.store.ts` with this content:

```ts
import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { of } from 'rxjs';

import { AppStore } from '@bk2/shared-feature';
import { MemberAgeConfig } from '@bk2/shared-models';
import { I18nService } from '@bk2/shared-i18n';
import { MembershipService } from '@bk2/relationship-membership-data-access';

import { PFX } from './scope';

export type AgeRow = { label: string; male: number; female: number; total: number };

const AGE_BUCKETS: Array<{ label: string; test: (age: number) => boolean }> = [
  { label: '< 20',  test: (a) => a < 20 },
  { label: '21–30', test: (a) => a >= 21 && a <= 30 },
  { label: '31–40', test: (a) => a >= 31 && a <= 40 },
  { label: '41–50', test: (a) => a >= 41 && a <= 50 },
  { label: '51–60', test: (a) => a >= 51 && a <= 60 },
  { label: '61–70', test: (a) => a >= 61 && a <= 70 },
  { label: '71–80', test: (a) => a >= 71 && a <= 80 },
  { label: '81–90', test: (a) => a >= 81 && a <= 90 },
  { label: '> 90',  test: (a) => a > 90 },
];

function computeAge(dob: string, todayStr: string): number {
  if (!dob || dob.length !== 8) return -1;
  const age = Number(todayStr.substring(0, 4)) - Number(dob.substring(0, 4));
  return todayStr.substring(4) < dob.substring(4) ? age - 1 : age;
}

// Exported for unit testing if test infra is added later
export function buildAgeRows(
  memberships: Array<{ memberDateOfBirth?: string; memberType?: string; relIsLast?: boolean; dateOfExit?: string }>,
  today: string
): AgeRow[] {
  const active = memberships.filter(m => m.relIsLast === true && (m.dateOfExit ?? '') > today);
  const rows: AgeRow[] = AGE_BUCKETS.map(bucket => {
    let male = 0;
    let female = 0;
    for (const m of active) {
      const age = computeAge(m.memberDateOfBirth ?? '', today);
      if (age < 0 || !bucket.test(age)) continue;
      if (m.memberType === 'male') male++;
      else if (m.memberType === 'female') female++;
    }
    return { label: bucket.label, male, female, total: male + female };
  });
  const totals = rows.reduce(
    (acc, r) => ({ label: 'Total', male: acc.male + r.male, female: acc.female + r.female, total: acc.total + r.total }),
    { label: 'Total', male: 0, female: 0, total: 0 }
  );
  return [...rows, totals];
}

type MemberAgeSectionState = { orgId: string };
const initialState: MemberAgeSectionState = { orgId: '' };

export const MemberAgeSectionStore = signalStore(
  withState(initialState),
  withProps(() => ({
    membershipService: inject(MembershipService),
    appStore: inject(AppStore),
    i18nService: inject(I18nService),
  })),
  withProps((store) => ({
    i18n: store.i18nService.translateAll({
      ageGroup: PFX + 'memberAge.ageGroup',
      male:     PFX + 'memberAge.male',
      female:   PFX + 'memberAge.female',
      total:    PFX + 'memberAge.total',
      empty:    PFX + 'memberAge.empty',
    }),

    membershipsResource: rxResource({
      params: () => ({ orgId: store.orgId() }),
      stream: ({ params }) => {
        if (!params.orgId) return of([]);
        return store.membershipService.listMembersOfOrg(params.orgId);
      },
    }),
  })),

  withComputed((store) => ({
    isLoading: computed(() => store.membershipsResource.isLoading()),
    rows: computed(() => buildAgeRows(
      store.membershipsResource.value() ?? [],
      new Date().toISOString().slice(0, 10).replace(/-/g, '')
    )),
  })),

  withMethods((store) => ({
    setConfig(config: MemberAgeConfig | undefined): void {
      patchState(store, { orgId: config?.orgId ?? '' });
    },
  }))
);
```

> Note: `today` is computed inline as a YYYYMMDD string (`new Date().toISOString().slice(0,10).replace(/-/g,'')`) so that `buildAgeRows` remains a pure function that can be tested independently. Avoids importing `getTodayStr` which has a default import cycle risk at this layer.

- [ ] **Step 2: Type-check `cms-section-feature`**

```bash
npx tsc --noEmit -p libs/cms/section/feature/tsconfig.json
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add libs/cms/section/feature/src/lib/member-age-section.store.ts
git commit -m "feat(cms-section-feature): add MemberAgeSectionStore"
```

---

## Task 4: Component — `member-age-section.ts`

**Files:**
- Create: `libs/cms/section/feature/src/lib/member-age-section.ts`

- [ ] **Step 1: Create the component file**

Create `libs/cms/section/feature/src/lib/member-age-section.ts` with this content:

```ts
import { Component, computed, effect, inject, input } from '@angular/core';
import { IonCard, IonCardContent, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';

import { MemberAgeSection } from '@bk2/shared-models';
import { EmptyList, Spinner } from '@bk2/shared-ui';

import { MemberAgeSectionStore } from './member-age-section.store';

@Component({
  selector: 'bk-member-age-section',
  standalone: true,
  imports: [Spinner, EmptyList, IonCard, IonCardContent, IonGrid, IonRow, IonCol],
  providers: [MemberAgeSectionStore],
  styles: [`
    .header-row { font-weight: 600; }
    .total-row  { font-weight: 700; }
    .num        { text-align: right; }
  `],
  template: `
    @if(store.isLoading()) {
      <bk-spinner />
    } @else if(isEmpty()) {
      <bk-empty-list [message]="store.i18n.empty()" />
    } @else {
      <ion-card>
        <ion-card-content>
          <ion-grid>
            <ion-row class="header-row">
              <ion-col>{{ store.i18n.ageGroup() }}</ion-col>
              <ion-col class="num">{{ store.i18n.male() }}</ion-col>
              <ion-col class="num">{{ store.i18n.female() }}</ion-col>
              <ion-col class="num">{{ store.i18n.total() }}</ion-col>
            </ion-row>
            @for(row of store.rows(); track row.label; let last = $last) {
              <ion-row [class.total-row]="last">
                <ion-col>{{ row.label }}</ion-col>
                <ion-col class="num">{{ row.male }}</ion-col>
                <ion-col class="num">{{ row.female }}</ion-col>
                <ion-col class="num">{{ row.total }}</ion-col>
              </ion-row>
            }
          </ion-grid>
        </ion-card-content>
      </ion-card>
    }
  `
})
export class MemberAgeSectionComponent {
  protected readonly store = inject(MemberAgeSectionStore);

  public section = input<MemberAgeSection>();
  public editMode = input<boolean>(false);

  protected readonly isEmpty = computed(() => (this.store.rows().at(-1)?.total ?? 0) === 0);

  constructor() {
    effect(() => {
      this.store.setConfig(this.section()?.properties);
    });
  }
}
```

- [ ] **Step 2: Type-check `cms-section-feature`**

```bash
npx tsc --noEmit -p libs/cms/section/feature/tsconfig.json
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add libs/cms/section/feature/src/lib/member-age-section.ts
git commit -m "feat(cms-section-feature): add MemberAgeSectionComponent"
```

---

## Task 5: Integration — dispatcher, exports, and final type-check

**Files:**
- Modify: `libs/cms/section/feature/src/lib/section-dispatcher.ts`
- Modify: `libs/cms/section/feature/src/index.ts`

- [ ] **Step 1: Add import to `section-dispatcher.ts`**

Add this import line after the `ContextDiagramSectionComponent` import:

```ts
import { MemberAgeSectionComponent } from './member-age-section';
```

- [ ] **Step 2: Add `MemberAgeSectionComponent` to the `imports` array**

In the `@Component` decorator, on the line that ends with `ContextDiagramSectionComponent,`, append:

```ts
// before
    ActivitiesSectionComponent, MessagesSectionComponent, NewsSectionComponent, OrgchartSectionComponent, RagSectionComponent, ContextDiagramSectionComponent,

// after
    ActivitiesSectionComponent, MessagesSectionComponent, NewsSectionComponent, OrgchartSectionComponent, RagSectionComponent, ContextDiagramSectionComponent, MemberAgeSectionComponent,
```

- [ ] **Step 3: Add `@case('member-age')` to the switch**

In `section-dispatcher.ts`, insert before `@default`:

```html
          @case('member-age') {
            <bk-member-age-section [section]="section" [editMode]="editMode()" />
          }
```

The template block before `@default` currently ends with:
```
          @case('video') {
            <bk-video-section [section]="section" />
          }
          @default {
```

Insert the new `@case` between `@case('video')` and `@default`.

- [ ] **Step 4: Export from `index.ts`**

Add these two lines at the end of `libs/cms/section/feature/src/index.ts`:

```ts
export * from './lib/member-age-section';
export * from './lib/member-age-section.store';
```

- [ ] **Step 5: Final type-check — `cms-section-feature`**

```bash
npx tsc --noEmit -p libs/cms/section/feature/tsconfig.json
```

Expected: zero errors.

- [ ] **Step 6: Build `scs-app` to confirm no downstream breakage**

```bash
pnpm nx build scs-app
```

Expected: build completes without errors.

- [ ] **Step 7: Commit**

```bash
git add libs/cms/section/feature/src/lib/section-dispatcher.ts libs/cms/section/feature/src/index.ts
git commit -m "feat(cms-section-feature): wire MemberAgeSectionComponent into SectionDispatcher"
```

---

## Spec coverage check

| Spec requirement | Task covering it |
|---|---|
| `MemberAgeSection` / `MemberAgeConfig` types | Task 1 |
| `SectionType` gains `'member-age'` | Task 1 |
| `SectionModel` union gains `MemberAgeSection` | Task 1 |
| `BaseSection.properties` union gains `MemberAgeConfig` | Task 1 |
| Shape constants `MEMBER_AGE_CONFIG_SHAPE` / `MEMBER_AGE_SECTION_SHAPE` | Task 1 |
| i18n keys `memberAge.*` in `de.json` | Task 2 |
| Store: `rxResource` → `listMembersOfOrg` | Task 3 |
| Active filter: `relIsLast === true AND dateOfExit > today` | Task 3 |
| Age buckets `< 20`, `21–30` … `> 90` + Total row | Task 3 |
| Birthday-adjusted age calculation | Task 3 (`computeAge`) |
| Invalid `memberDateOfBirth` silently excluded | Task 3 (`computeAge` returns -1, no bucket matches) |
| Unknown gender silently excluded | Task 3 (`memberType !== 'male' && !== 'female'` → skipped) |
| `rows`, `isLoading`, `setConfig`, `i18n` public API | Task 3 |
| Component `bk-member-age-section`, ion-grid table | Task 4 |
| Spinner while loading | Task 4 |
| Empty-list when all decade totals are 0 | Task 4 |
| Total row bold | Task 4 (`.total-row` on `last`) |
| `section-dispatcher.ts` `@case('member-age')` | Task 5 |
| `index.ts` exports | Task 5 |

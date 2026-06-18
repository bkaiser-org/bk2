# Session Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Track user sessions (anonymous + authenticated) in Firestore and display them in the Aoc admin panel.

**Architecture:** A new `SessionService` in `@bk2/session-data-access` owns Firestore writes. `AppStore` wires it to Firebase auth state and browser visibility events. Two Cloud Functions handle iOS-Safari-safe session-end and orphan cleanup.

**Tech Stack:** Angular 20 signals, NgRx Signal Stores, Firebase Firestore, Firebase Cloud Functions v2 (Node.js), `@capacitor/app` for native events.

---

## File Map

| File | Action |
|---|---|
| `libs/shared/models/src/lib/session.model.ts` | Create |
| `libs/shared/models/src/index.ts` | Modify — add export |
| `tsconfig.base.json` | Modify — add `@bk2/session-data-access` path alias |
| `libs/session/data-access/package.json` | Create |
| `libs/session/data-access/tsconfig.json` | Create |
| `libs/session/data-access/tsconfig.lib.json` | Create |
| `libs/session/data-access/src/index.ts` | Create |
| `libs/session/data-access/src/lib/session.service.ts` | Create |
| `libs/shared/feature/src/lib/app.store.ts` | Modify — inject SessionService, wire effects |
| `apps/functions/src/session/index.ts` | Create — endSession + orphan cleanup |
| `apps/functions/src/main.ts` | Modify — export new functions |
| `libs/aoc/feature/src/lib/aoc-session.store.ts` | Create |
| `libs/aoc/feature/src/lib/aoc-session.ts` | Create |
| `libs/aoc/feature/src/index.ts` | Modify — add exports |
| `apps/scs-app/src/app/app.routes.ts` | Modify — add `/aoc/sessions` route |
| `apps/test-app/src/app/app.routes.ts` | Modify — add `/aoc/sessions` route |

---

## Task 1: SessionModel

**Files:**
- Create: `libs/shared/models/src/lib/session.model.ts`
- Modify: `libs/shared/models/src/index.ts`

- [ ] **Step 1: Create the model file**

```ts
// libs/shared/models/src/lib/session.model.ts
import { DEFAULT_KEY, DEFAULT_TENANTS } from '@bk2/shared-constants';
import { BkModel } from './base.model';

// Defined here to avoid a dependency on @bk2/shared-util-angular (which would create a circular risk).
// Keep in sync with BrowserName in platform.util.ts.
export type BrowserName = 'safari' | 'chrome' | 'firefox' | 'opera' | 'other';
export type OsName = 'ios' | 'android' | 'macos' | 'windows' | 'other';

export class SessionModel implements BkModel {
  public bkey = DEFAULT_KEY;
  public tenants: string[] = DEFAULT_TENANTS;
  public isArchived = false;

  public startedAt = '';        // StoreDateTime: yyyyMMddHHmmss
  public endedAt = '';          // StoreDateTime, empty while active
  public lastSeenAt = '';       // StoreDateTime, updated by heartbeat every 5 min
  public durationSeconds = 0;   // set on session end
  public isActive = true;

  public userKey = '';          // UserModel.bkey, empty for anonymous sessions
  public userEmail = '';        // Firebase Auth email, empty for anonymous sessions

  public browser: BrowserName = 'other';
  public os: OsName = 'other';

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const SessionCollection = 'sessions';
export const SessionModelName = 'session';
```

- [ ] **Step 2: Export from models index**

Add to `libs/shared/models/src/index.ts` (alphabetical order, near other model exports):

```ts
export * from './lib/session.model';
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit -p libs/shared/models/tsconfig.json 2>&1
```

Expected: no errors.

> **Note:** `BrowserName` is imported from `@bk2/shared-util-angular`. Check that `libs/shared/models/tsconfig.json` has a reference to `shared-util-angular/tsconfig.lib.json` and that `libs/shared/models/package.json` lists `@bk2/shared-util-angular` as a dependency. If not, add them now following the same pattern as other `@bk2/*` dependencies in that file.

- [ ] **Step 4: Commit**

```bash
git add libs/shared/models/src/lib/session.model.ts libs/shared/models/src/index.ts
git commit -m "feat: add SessionModel for session analytics"
```

---

## Task 2: Scaffold `session/data-access` lib

**Files:**
- Create: `libs/session/data-access/package.json`
- Create: `libs/session/data-access/tsconfig.json`
- Create: `libs/session/data-access/tsconfig.lib.json`
- Create: `libs/session/data-access/src/index.ts`
- Modify: `tsconfig.base.json`

- [ ] **Step 1: Create `package.json`**

```json
// libs/session/data-access/package.json
{
  "name": "@bk2/session-data-access",
  "version": "0.0.1",
  "main": "./src/index.js",
  "types": "./src/index.d.ts",
  "sideEffects": false,
  "private": true,
  "dependencies": {
    "tslib": "^2.8.1",
    "@bk2/shared-models": "*",
    "@bk2/shared-config": "*",
    "@bk2/shared-data-access": "*",
    "@bk2/shared-util-angular": "*",
    "@bk2/shared-util-core": "*"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
// libs/session/data-access/tsconfig.json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true,
    "types": ["node", "vitest"],
    "declaration": true
  },
  "angularCompilerOptions": {
    "strictTemplates": true,
    "strictInjectionParameters": true,
    "fullTemplateTypeCheck": true,
    "disableTypeScriptVersionCheck": true,
    "compileNonExportedClasses": true,
    "skipTemplateCodegen": false
  },
  "include": ["src/**/*", "**/*.spec.ts", "**/*.test.ts"],
  "exclude": ["dist/**/*"],
  "references": [
    {"path": "../../shared/models/tsconfig.lib.json"},
    {"path": "../../shared/config/tsconfig.lib.json"},
    {"path": "../../shared/data-access/tsconfig.lib.json"},
    {"path": "../../shared/util-angular/tsconfig.lib.json"},
    {"path": "../../shared/util-core/tsconfig.lib.json"}
  ]
}
```

- [ ] **Step 3: Create `tsconfig.lib.json`**

```json
// libs/session/data-access/tsconfig.lib.json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "../../../dist/libs/session/data-access",
    "declaration": true,
    "composite": true,
    "module": "es2020",
    "target": "es2020",
    "types": [],
    "tsBuildInfoFile": "../../../dist/out-tsc/session-data-access.tsbuildinfo"
  },
  "include": ["src/**/*.ts"],
  "exclude": [
    "**/*.spec.ts",
    "**/*.spec2.ts",
    "**/test-setup.ts",
    "vite.config.ts"
  ]
}
```

- [ ] **Step 4: Create `src/index.ts`**

```ts
// libs/session/data-access/src/index.ts
export * from './lib/session.service';
```

- [ ] **Step 5: Register path alias in `tsconfig.base.json`**

Find the `"@bk2/session*"` section (or add near `@bk2/shared*` entries). Add:

```json
"@bk2/session-data-access": ["libs/session/data-access/src/index.ts"],
```

- [ ] **Step 6: Commit**

```bash
git add libs/session/data-access/ tsconfig.base.json
git commit -m "feat: scaffold session/data-access lib"
```

---

## Task 3: SessionService

**Files:**
- Create: `libs/session/data-access/src/lib/session.service.ts`

- [ ] **Step 1: Create the service**

```ts
// libs/session/data-access/src/lib/session.service.ts
import { inject, Injectable, PLATFORM_ID } from '@angular/core';
import { ENV } from '@bk2/shared-config';
import { FirestoreService } from '@bk2/shared-data-access';
import { OsName, SessionCollection, SessionModel, UserModel } from '@bk2/shared-models';
import { getBrowser, isBrowser, isIOS, isAndroid, isMacOS, isSafari } from '@bk2/shared-util-angular';
import { DateFormat, getTodayStr } from '@bk2/shared-util-core';

@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly firestoreService = inject(FirestoreService);
  private readonly env = inject(ENV);
  private readonly platformId = inject(PLATFORM_ID);

  private session: SessionModel | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  public get hasActiveSession(): boolean {
    return this.session?.bkey !== '' && this.session?.bkey !== undefined && this.session !== null;
  }

  public async startSession(): Promise<void> {
    if (!isBrowser(this.platformId)) return;
    if (this.hasActiveSession) return;

    const session = new SessionModel(this.env.tenantId);
    session.startedAt = getTodayStr(DateFormat.StoreDateTime);
    session.lastSeenAt = session.startedAt;
    session.isActive = true;
    session.browser = getBrowser();
    session.os = this.detectOs();

    const key = await this.firestoreService.createModel<SessionModel>(SessionCollection, session, undefined, undefined);
    if (key) {
      session.bkey = key;
      this.session = session;
      this.startHeartbeat();
    }
  }

  public async upgradeSession(user: UserModel): Promise<void> {
    if (!this.session) return;
    this.session.userKey = user.bkey;
    this.session.userEmail = user.loginEmail;
    await this.firestoreService.updateModel<SessionModel>(SessionCollection, this.session, undefined);
  }

  public async endSession(): Promise<void> {
    if (!this.session) return;
    const session = this.session;
    this.session = null;
    this.stopHeartbeat();

    const endedAt = getTodayStr(DateFormat.StoreDateTime);
    session.isActive = false;
    session.endedAt = endedAt;
    session.durationSeconds = this.calcDurationSeconds(session.startedAt, endedAt);

    if (isSafari() || isIOS()) {
      this.sendBeacon(session);
    }
    await this.firestoreService.updateModel<SessionModel>(SessionCollection, session, undefined);
  }

  private async heartbeat(): Promise<void> {
    if (!this.session) return;
    this.session.lastSeenAt = getTodayStr(DateFormat.StoreDateTime);
    await this.firestoreService.updateModel<SessionModel>(SessionCollection, this.session, undefined);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => this.heartbeat(), 5 * 60 * 1000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private detectOs(): OsName {
    if (isIOS()) return 'ios';
    if (isAndroid()) return 'android';
    if (isMacOS()) return 'macos';
    if (typeof navigator !== 'undefined' && /windows/i.test(navigator.userAgent)) return 'windows';
    return 'other';
  }

  private calcDurationSeconds(startedAt: string, endedAt: string): number {
    const parse = (sdt: string): number => {
      const y = +sdt.slice(0, 4), mo = +sdt.slice(4, 6) - 1;
      const d = +sdt.slice(6, 8), h = +sdt.slice(8, 10);
      const m = +sdt.slice(10, 12), s = +sdt.slice(12, 14);
      return new Date(y, mo, d, h, m, s).getTime();
    };
    return Math.max(0, Math.floor((parse(endedAt) - parse(startedAt)) / 1000));
  }

  private sendBeacon(session: SessionModel): void {
    if (typeof navigator === 'undefined' || !navigator.sendBeacon) return;
    const region = 'europe-west6';
    const projectId = this.env.firebase.projectId;
    const url = `https://${region}-${projectId}.cloudfunctions.net/endSession`;
    const payload = JSON.stringify({ sessionKey: session.bkey, tenantId: this.env.tenantId });
    navigator.sendBeacon(url, new Blob([payload], { type: 'application/json' }));
  }
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit -p libs/session/data-access/tsconfig.json 2>&1
```

Expected: no errors.

- [ ] **Step 3: Build to generate declarations (required for dependents)**

```bash
pnpm nx build session-data-access 2>&1 | tail -5
```

Expected: `Successfully ran target build`.

- [ ] **Step 4: Commit**

```bash
git add libs/session/data-access/src/lib/session.service.ts
git commit -m "feat: implement SessionService with start/upgrade/end/heartbeat"
```

---

## Task 4: Wire SessionService into AppStore

**Files:**
- Modify: `libs/shared/feature/src/lib/app.store.ts`

- [ ] **Step 1: Add imports**

Add to the import block at the top of `app.store.ts`:

```ts
import { computed, effect, inject, PLATFORM_ID } from '@angular/core';
import { App } from '@capacitor/app';
import { isBrowser } from '@bk2/shared-util-angular';
import { SessionService } from '@bk2/session-data-access';
```

Replace the existing `import { computed, inject }` line with the one above.

- [ ] **Step 2: Add `sessionService` and `platformId` to `withProps`**

In the first `withProps(() => ({ ... }))` block (around line 60), add two entries:

```ts
platformId: inject(PLATFORM_ID),
sessionService: inject(SessionService),
```

- [ ] **Step 3: Extend `withHooks.onInit`**

Replace the existing `withHooks` block:

```ts
withHooks({
  onInit(store) {
    patchState(store, {
      tenantId: store.env.tenantId,
      production: store.env.production,
      useEmulators: store.env.useEmulators,
      firebase: store.env.firebase,
      services: store.env.services
    });

    if (!isBrowser(store.platformId)) return;

    // Start anonymous session immediately on bootstrap
    store.sessionService.startSession();

    // Upgrade or end session when auth state changes
    effect(() => {
      const user = store.currentUser();
      if (user) {
        store.sessionService.upgradeSession(user);
      }
    });

    effect(() => {
      const fbUser = store.fbUser();
      if (!fbUser) {
        store.sessionService.endSession();
      }
    });

    // End session when tab is hidden; start fresh when it becomes visible again
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        store.sessionService.endSession();
      } else if (document.visibilityState === 'visible' && !store.sessionService.hasActiveSession) {
        store.sessionService.startSession().then(() => {
          const user = store.currentUser();
          if (user) store.sessionService.upgradeSession(user);
        });
      }
    });

    // Capacitor: supplement visibilitychange on native iOS/Android
    App.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) {
        store.sessionService.endSession();
      } else if (isActive && !store.sessionService.hasActiveSession) {
        store.sessionService.startSession().then(() => {
          const user = store.currentUser();
          if (user) store.sessionService.upgradeSession(user);
        });
      }
    });
  }
})
```

- [ ] **Step 4: Update `shared-feature` dependencies**

In `libs/shared/feature/package.json`, add `"@bk2/session-data-access": "*"`.

In `libs/shared/feature/tsconfig.json` `references` array, add:
```json
{"path": "../../session/data-access/tsconfig.lib.json"}
```

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit -p libs/shared/feature/tsconfig.json 2>&1
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add libs/shared/feature/
git commit -m "feat: wire SessionService into AppStore for session lifecycle tracking"
```

---

## Task 5: Cloud Function — `endSession` (iOS Safari beacon fallback)

**Files:**
- Create: `apps/functions/src/session/index.ts`
- Modify: `apps/functions/src/main.ts`

- [ ] **Step 1: Create `apps/functions/src/session/index.ts`**

```ts
// apps/functions/src/session/index.ts
import { onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions/v2';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

const REGION = 'europe-west6';
const SESSION_COLLECTION = 'sessions';

/**
 * HTTPS endpoint called via navigator.sendBeacon on iOS Safari visibilitychange.
 * Body: { sessionKey: string, tenantId: string }
 */
export const endSession = onRequest(
  { region: REGION, cors: true },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }
    const { sessionKey, tenantId } = req.body as { sessionKey?: string; tenantId?: string };
    if (!sessionKey || !tenantId) {
      res.status(400).send('Missing sessionKey or tenantId');
      return;
    }
    try {
      const db = getFirestore();
      const ref = db.collection(SESSION_COLLECTION).doc(sessionKey);
      const snap = await ref.get();
      if (!snap.exists) {
        res.status(404).send('Session not found');
        return;
      }
      const data = snap.data()!;
      if (!data['isActive']) {
        res.status(200).send('Already closed');
        return;
      }
      const endedAt = formatStoreDateTime(new Date());
      const durationSeconds = calcDurationSeconds(data['startedAt'] as string, endedAt);
      await ref.update({ isActive: false, endedAt, durationSeconds });
      logger.info(`endSession: closed session ${sessionKey}`);
      res.status(200).send('OK');
    } catch (err) {
      logger.error('endSession: error', err);
      res.status(500).send('Internal error');
    }
  }
);

/**
 * Scheduled cleanup: marks orphaned sessions (isActive=true, lastSeenAt older than 30 min) as ended.
 * Runs every 30 minutes.
 */
export const cleanupOrphanSessions = onSchedule(
  { schedule: 'every 30 minutes', region: REGION },
  async () => {
    const db = getFirestore();
    const threshold = new Date(Date.now() - 30 * 60 * 1000);
    const thresholdStr = formatStoreDateTime(threshold);

    const snap = await db.collection(SESSION_COLLECTION)
      .where('isActive', '==', true)
      .where('lastSeenAt', '<', thresholdStr)
      .get();

    if (snap.empty) {
      logger.info('cleanupOrphanSessions: no orphans found');
      return;
    }

    const batch = db.batch();
    for (const doc of snap.docs) {
      const data = doc.data();
      const endedAt = data['lastSeenAt'] as string;
      const durationSeconds = calcDurationSeconds(data['startedAt'] as string, endedAt);
      batch.update(doc.ref, { isActive: false, endedAt, durationSeconds });
    }
    await batch.commit();
    logger.info(`cleanupOrphanSessions: closed ${snap.size} orphaned sessions`);
  }
);

function formatStoreDateTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function calcDurationSeconds(startedAt: string, endedAt: string): number {
  const parse = (sdt: string): number => {
    const y = +sdt.slice(0, 4), mo = +sdt.slice(4, 6) - 1;
    const d = +sdt.slice(6, 8), h = +sdt.slice(8, 10);
    const m = +sdt.slice(10, 12), s = +sdt.slice(12, 14);
    return new Date(y, mo, d, h, m, s).getTime();
  };
  return Math.max(0, Math.floor((parse(endedAt) - parse(startedAt)) / 1000));
}
```

- [ ] **Step 2: Export from `main.ts`**

Add a `session` import block to `apps/functions/src/main.ts`:

```ts
import * as Session from './session';
```

And export the functions (add to the end of the exports section):

```ts
// session analytics
export const endSession = Session.endSession;
export const cleanupOrphanSessions = Session.cleanupOrphanSessions;
```

- [ ] **Step 3: Build Cloud Functions**

```bash
pnpm nx build functions --configuration production 2>&1 | tail -10
```

Expected: `Successfully ran target build`.

- [ ] **Step 4: Commit**

```bash
git add apps/functions/src/session/ apps/functions/src/main.ts
git commit -m "feat: add endSession HTTPS function and cleanupOrphanSessions scheduled function"
```

---

## Task 6: Aoc Session Store

**Files:**
- Create: `libs/aoc/feature/src/lib/aoc-session.store.ts`

- [ ] **Step 1: Create the store**

```ts
// libs/aoc/feature/src/lib/aoc-session.store.ts
import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { Observable } from 'rxjs';

import { FirestoreService } from '@bk2/shared-data-access';
import { AppStore } from '@bk2/shared-feature';
import { SessionCollection, SessionModel } from '@bk2/shared-models';
import { DateFormat, getTodayStr } from '@bk2/shared-util-core';

export type DateFilter = 'today' | 'week' | 'all';

export type AocSessionState = {
  dateFilter: DateFilter;
};

const initialState: AocSessionState = {
  dateFilter: 'all',
};

export const AocSessionStore = signalStore(
  withState(initialState),
  withProps(() => ({
    appStore: inject(AppStore),
    firestoreService: inject(FirestoreService),
  })),
  withProps(store => ({
    sessionsResource: rxResource({
      params: () => ({ tenantId: store.appStore.tenantId() }),
      stream: ({ params }): Observable<SessionModel[]> => {
        const query = [{ key: 'tenants', operator: 'array-contains', value: params.tenantId }];
        return store.firestoreService.searchData<SessionModel>(SessionCollection, query, 'startedAt', 'desc');
      },
    }),
  })),
  withComputed(state => ({
    isLoading: computed(() => state.sessionsResource.isLoading()),
    allSessions: computed(() => state.sessionsResource.value() ?? []),
    currentUser: computed(() => state.appStore.currentUser()),
  })),
  withComputed(state => {
    const filterByDate = (sessions: SessionModel[], filter: DateFilter): SessionModel[] => {
      if (filter === 'all') return sessions;
      const today = getTodayStr(DateFormat.StoreDate); // yyyyMMdd
      if (filter === 'today') return sessions.filter(s => s.startedAt.startsWith(today));
      // week: last 7 days
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const weekAgoStr = `${weekAgo.getFullYear()}${String(weekAgo.getMonth() + 1).padStart(2, '0')}${String(weekAgo.getDate()).padStart(2, '0')}`;
      return sessions.filter(s => s.startedAt.slice(0, 8) >= weekAgoStr);
    };

    return {
      sessions: computed(() => filterByDate(state.allSessions(), state.dateFilter())),
      activeCount: computed(() => state.allSessions().filter(s => s.isActive).length),
      uniqueUserCount: computed(() => new Set(state.allSessions().filter(s => s.userKey).map(s => s.userKey)).size),
      anonymousCount: computed(() => state.allSessions().filter(s => !s.userKey).length),
    };
  }),
  withMethods(store => ({
    setDateFilter(filter: DateFilter): void {
      patchState(store, { dateFilter: filter });
    },
    reload(): void {
      store.sessionsResource.reload();
    },
  }))
);
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit -p libs/aoc/feature/tsconfig.json 2>&1
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add libs/aoc/feature/src/lib/aoc-session.store.ts
git commit -m "feat: add AocSessionStore for session analytics"
```

---

## Task 7: Aoc Session Component

**Files:**
- Create: `libs/aoc/feature/src/lib/aoc-session.ts`
- Modify: `libs/aoc/feature/src/index.ts`

- [ ] **Step 1: Create the component**

```ts
// libs/aoc/feature/src/lib/aoc-session.ts
import { AsyncPipe, DatePipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import {
  IonBadge, IonButton, IonButtons, IonCard, IonCardContent, IonCardHeader,
  IonCardTitle, IonCol, IonContent, IonGrid, IonHeader, IonItem, IonLabel,
  IonMenuButton, IonRow, IonTitle, IonToolbar
} from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { SpinnerComponent } from '@bk2/shared-ui';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { DateFormat, convertDateFormatToString } from '@bk2/shared-util-core';
import { AocSessionStore, DateFilter } from './aoc-session.store';

@Component({
  selector: 'bk-aoc-session',
  standalone: true,
  imports: [
    AsyncPipe,
    TranslatePipe, SvgIconPipe,
    SpinnerComponent,
    IonHeader, IonToolbar, IonButtons, IonMenuButton, IonButton, IonTitle,
    IonContent, IonCard, IonCardHeader, IonCardTitle, IonCardContent,
    IonGrid, IonRow, IonCol, IonItem, IonLabel, IonBadge,
  ],
  providers: [AocSessionStore],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
        <ion-title>{{ sessions().length }} Sessions ({{ activeCount() }} active)</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="setFilter('today')" [color]="dateFilter() === 'today' ? 'primary' : 'medium'">Today</ion-button>
          <ion-button (click)="setFilter('week')" [color]="dateFilter() === 'week' ? 'primary' : 'medium'">Week</ion-button>
          <ion-button (click)="setFilter('all')" [color]="dateFilter() === 'all' ? 'primary' : 'medium'">All</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      @if (isLoading()) {
        <bk-spinner />
      } @else {
        <ion-card>
          <ion-card-header>
            <ion-card-title>
              {{ uniqueUserCount() }} users &nbsp;|&nbsp;
              {{ anonymousCount() }} anonymous &nbsp;|&nbsp;
              {{ activeCount() }} active
            </ion-card-title>
          </ion-card-header>
        </ion-card>

        <!-- list header -->
        <ion-toolbar color="primary">
          <ion-item lines="none" color="primary">
            <ion-label><strong>User</strong></ion-label>
            <ion-label><strong>Browser</strong></ion-label>
            <ion-label><strong>OS</strong></ion-label>
            <ion-label><strong>Started</strong></ion-label>
            <ion-label><strong>Duration</strong></ion-label>
            <ion-label><strong>Status</strong></ion-label>
          </ion-item>
        </ion-toolbar>

        @for (session of sessions(); track session.bkey) {
          <ion-item>
            <ion-label>{{ session.userEmail || 'anonymous' }}</ion-label>
            <ion-label>{{ session.browser }}</ion-label>
            <ion-label>{{ session.os }}</ion-label>
            <ion-label>{{ formatDate(session.startedAt) }}</ion-label>
            <ion-label>{{ formatDuration(session) }}</ion-label>
            <ion-label>
              <ion-badge [color]="statusColor(session)">{{ statusLabel(session) }}</ion-badge>
            </ion-label>
          </ion-item>
        }
      }
    </ion-content>
  `,
})
export class AocSession {
  private readonly store = inject(AocSessionStore);

  protected readonly isLoading = this.store.isLoading;
  protected readonly sessions = this.store.sessions;
  protected readonly activeCount = this.store.activeCount;
  protected readonly uniqueUserCount = this.store.uniqueUserCount;
  protected readonly anonymousCount = this.store.anonymousCount;
  protected readonly dateFilter = this.store.dateFilter;

  protected setFilter(filter: DateFilter): void {
    this.store.setDateFilter(filter);
  }

  protected formatDate(sdt: string): string {
    if (!sdt) return '—';
    return convertDateFormatToString(sdt, DateFormat.StoreDateTime, DateFormat.ViewDateTime);
  }

  protected formatDuration(session: { isActive: boolean; durationSeconds: number }): string {
    if (session.isActive) return '—';
    const s = session.durationSeconds;
    if (s < 60) return `${s}s`;
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  }

  protected statusLabel(session: { isActive: boolean; lastSeenAt: string }): string {
    if (!session.isActive) return 'ended';
    const now = Date.now();
    const parse = (sdt: string): number => {
      const y = +sdt.slice(0, 4), mo = +sdt.slice(4, 6) - 1;
      const d = +sdt.slice(6, 8), h = +sdt.slice(8, 10);
      const m = +sdt.slice(10, 12), s = +sdt.slice(12, 14);
      return new Date(y, mo, d, h, m, s).getTime();
    };
    const age = (now - parse(session.lastSeenAt)) / 1000 / 60;
    return age > 30 ? 'orphaned' : 'active';
  }

  protected statusColor(session: { isActive: boolean; lastSeenAt: string }): string {
    const label = this.statusLabel(session);
    if (label === 'active') return 'success';
    if (label === 'orphaned') return 'warning';
    return 'medium';
  }
}
```

- [ ] **Step 2: Export from `aoc-feature` index**

Add to `libs/aoc/feature/src/index.ts`:

```ts
export * from './lib/aoc-session';
export * from './lib/aoc-session.store';
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit -p libs/aoc/feature/tsconfig.json 2>&1
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add libs/aoc/feature/src/lib/aoc-session.ts libs/aoc/feature/src/index.ts
git commit -m "feat: add AocSession component for session analytics list"
```

---

## Task 8: Route Registration

**Files:**
- Modify: `apps/scs-app/src/app/app.routes.ts`
- Modify: `apps/test-app/src/app/app.routes.ts`

- [ ] **Step 1: Add route to `scs-app`**

In `apps/scs-app/src/app/app.routes.ts`, inside the `aoc` children array, add after the `srv` entry:

```ts
{ path: 'sessions', canActivate: [isAdminGuard], loadComponent: () => import('@bk2/aoc-feature').then(m => m.AocSession) },
```

- [ ] **Step 2: Add route to `test-app`**

Apply the same change in `apps/test-app/src/app/app.routes.ts`.

- [ ] **Step 3: Type-check both apps**

```bash
npx tsc --noEmit -p apps/scs-app/tsconfig.app.json 2>&1
npx tsc --noEmit -p apps/test-app/tsconfig.app.json 2>&1
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/scs-app/src/app/app.routes.ts apps/test-app/src/app/app.routes.ts
git commit -m "feat: add /aoc/sessions route for session analytics"
```

---

## Task 9: Manual Smoke Test

- [ ] **Step 1: Serve the app**

```bash
source ./apps/scs-app/.env && ts-node ./set-env.js
pnpm nx serve scs-app
```

- [ ] **Step 2: Verify session start**

Open browser devtools → Network tab. Load the app. Verify a `POST` to the Firestore `sessions` collection appears (or check Firestore console — a new document appears in `sessions` with `isActive: true`, empty `userKey`).

- [ ] **Step 3: Verify session upgrade**

Log in. Verify the session document is updated with `userKey` and `userEmail`.

- [ ] **Step 4: Verify session end**

Switch tab (background the tab). Verify the session document is updated with `isActive: false` and `durationSeconds > 0`.

- [ ] **Step 5: Verify Aoc UI**

Navigate to `/aoc/sessions`. Verify the session list renders with correct columns and status badges.

- [ ] **Step 6: Verify orphan cleanup (optional — requires deployed CF)**

```bash
pnpm nx build functions --configuration production
firebase deploy --only functions:cleanupOrphanSessions
```

Wait 30 minutes or trigger manually via Firebase console.

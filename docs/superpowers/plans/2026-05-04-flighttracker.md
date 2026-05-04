# Flight Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/flighttracker` page where authenticated users can look up live flight data by flight number and date, view the flight on a Google Maps view, and tap the plane marker to see full flight details.

**Architecture:** Cloud Function `getFlightInfo` calls the aviationstack API and caches airport coordinates in the existing `locations` Firestore collection (`type: 'airport'`, `bkey = IATA code`). Two new libs under `libs/geo/flighttracker/`: `data-access` (service wrapping the callable) and `feature` (store + search page + detail modal). The map uses `@capacitor/google-maps` matching the existing `MapSectionComponent` pattern.

**Tech Stack:** Angular v20 (signals, standalone, zoneless), Ionic Angular, NgRx Signal Stores (`@ngrx/signals`), Firebase Cloud Functions v2 (Gen2), `@capacitor/google-maps`, aviationstack REST API.

**Note on naming:** Import aliases follow the existing `geo/location` pattern — `@bk2/flighttracker-data-access` and `@bk2/flighttracker-feature` (no `geo-` prefix in alias, matching `@bk2/location-data-access`).

---

## File Map

**Create:**
- `apps/functions/src/flighttracker/index.ts` — `getFlightInfo` cloud function with Firestore airport cache
- `libs/geo/flighttracker/data-access/project.json`
- `libs/geo/flighttracker/data-access/README.md`
- `libs/geo/flighttracker/data-access/tsconfig.json`
- `libs/geo/flighttracker/data-access/tsconfig.lib.json`
- `libs/geo/flighttracker/data-access/package.json`
- `libs/geo/flighttracker/data-access/src/index.ts`
- `libs/geo/flighttracker/data-access/src/lib/flighttracker.service.ts`
- `libs/geo/flighttracker/feature/project.json`
- `libs/geo/flighttracker/feature/README.md`
- `libs/geo/flighttracker/feature/tsconfig.json`
- `libs/geo/flighttracker/feature/tsconfig.lib.json`
- `libs/geo/flighttracker/feature/package.json`
- `libs/geo/flighttracker/feature/src/index.ts`
- `libs/geo/flighttracker/feature/src/lib/flighttracker.store.ts`
- `libs/geo/flighttracker/feature/src/lib/flighttracker-detail.modal.ts`
- `libs/geo/flighttracker/feature/src/lib/flighttracker-search.component.ts`

**Modify:**
- `apps/functions/src/main.ts` — export `getFlightInfo`
- `tsconfig.base.json` — add `@bk2/flighttracker-data-access` and `@bk2/flighttracker-feature` path aliases
- `apps/scs-app/src/app/app.routes.ts` — add `/flighttracker` route
- `apps/scs-app/src/assets/i18n/de.json` — add `flighttracker` section

---

## Task 1: Store the AVIATIONSTACK API key secret

**Files:**
- No code changes — manual Firebase CLI step

- [ ] **Step 1: Set the secret**

```bash
firebase functions:secrets:set AVIATIONSTACK_APIKEY
```

When prompted, paste the API key value. Press Enter to confirm.

- [ ] **Step 2: Verify the secret exists**

```bash
firebase functions:secrets:access AVIATIONSTACK_APIKEY
```

Expected: prints the key value without error.

---

## Task 2: Cloud Function `getFlightInfo`

**Files:**
- Create: `apps/functions/src/flighttracker/index.ts`
- Modify: `apps/functions/src/main.ts`

- [ ] **Step 1: Create the function file**

Create `apps/functions/src/flighttracker/index.ts`:

```typescript
import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';
import axios from 'axios';

const aviationApiKey = defineSecret('AVIATIONSTACK_APIKEY');
const AVIATION_BASE = 'https://api.aviationstack.com/v1';

export interface FlightInfoRequest {
  flightNumber: string; // e.g. "LX1234"
  date: string;         // YYYY-MM-DD
}

export interface FlightEndpoint {
  airport: string;
  iata: string;
  terminal?: string;
  gate?: string;
  delay?: number;
  scheduled?: string;
  estimated?: string;
  lat?: number;
  lng?: number;
}

export interface FlightAircraft {
  registration?: string;
  iata?: string;
  icao24?: string;
}

export interface FlightLivePosition {
  latitude: number;
  longitude: number;
  altitude: number;
  direction: number;
  speed_horizontal: number;
}

export interface FlightInfoResponse {
  flightNumber: string;
  status: string; // 'scheduled' | 'active' | 'landed' | 'cancelled' | 'unknown'
  departure: FlightEndpoint;
  arrival: FlightEndpoint;
  aircraft?: FlightAircraft;
  live?: FlightLivePosition;
}

async function resolveAirportCoords(
  iata: string,
  key: string
): Promise<{ lat: number; lng: number } | undefined> {
  const db = getFirestore();
  const snap = await db.collection('locations').doc(iata).get();
  if (snap.exists) {
    const d = snap.data();
    if (d?.type === 'airport' && d.latitude != null && d.longitude != null) {
      return { lat: d.latitude, lng: d.longitude };
    }
  }
  try {
    const { data } = await axios.get(`${AVIATION_BASE}/airports`, {
      params: { access_key: key, search: iata, limit: 1 },
    });
    const airport = data?.data?.[0];
    if (!airport?.latitude || !airport?.longitude) return undefined;
    const lat = parseFloat(airport.latitude);
    const lng = parseFloat(airport.longitude);
    if (isNaN(lat) || isNaN(lng)) return undefined;
    // Cache without bkey (stripped per project convention — re-attached on read)
    await db.collection('locations').doc(iata).set({
      type: 'airport',
      tenants: ['_global'],
      name: airport.airport_name ?? iata,
      latitude: lat,
      longitude: lng,
      isArchived: false,
      tags: '',
      index: iata.toLowerCase(),
      address: '',
      placeId: '',
      what3words: '',
      seaLevel: 0,
      speed: 0,
      direction: 0,
      distance: 0,
      notes: '',
    });
    return { lat, lng };
  } catch (err: unknown) {
    logger.warn(`resolveAirportCoords: failed for ${iata}`, { err: String(err) });
    return undefined;
  }
}

export const getFlightInfo = onCall(
  {
    region: 'europe-west6',
    enforceAppCheck: true,
    secrets: [aviationApiKey],
  },
  async (request: CallableRequest<FlightInfoRequest>): Promise<FlightInfoResponse> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    const { flightNumber, date } = request.data;
    if (!flightNumber?.trim() || !date?.trim()) {
      throw new HttpsError('invalid-argument', 'flightNumber and date are required');
    }

    const key = aviationApiKey.value();
    logger.info('getFlightInfo', { flightNumber, date });

    let flightRaw: any;
    try {
      const { data } = await axios.get(`${AVIATION_BASE}/flights`, {
        params: {
          access_key: key,
          flight_iata: flightNumber.trim(),
          flight_date: date.trim(),
          limit: 1,
        },
      });
      flightRaw = data;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('getFlightInfo: flights API error', { msg });
      throw new HttpsError('internal', msg);
    }

    const flight = flightRaw?.data?.[0];
    if (!flight) {
      throw new HttpsError('not-found', `No flight found for ${flightNumber} on ${date}`);
    }

    const dep = flight.departure ?? {};
    const arr = flight.arrival ?? {};

    const [depCoords, arrCoords] = await Promise.all([
      resolveAirportCoords(dep.iata, key),
      resolveAirportCoords(arr.iata, key),
    ]);

    const result: FlightInfoResponse = {
      flightNumber: flight.flight?.iata ?? flightNumber,
      status: flight.flight_status ?? 'unknown',
      departure: {
        airport: dep.airport ?? '',
        iata: dep.iata ?? '',
        terminal: dep.terminal ?? undefined,
        gate: dep.gate ?? undefined,
        delay: dep.delay ?? undefined,
        scheduled: dep.scheduled ?? undefined,
        estimated: dep.estimated ?? undefined,
        lat: depCoords?.lat,
        lng: depCoords?.lng,
      },
      arrival: {
        airport: arr.airport ?? '',
        iata: arr.iata ?? '',
        terminal: arr.terminal ?? undefined,
        gate: arr.gate ?? undefined,
        delay: arr.delay ?? undefined,
        scheduled: arr.scheduled ?? undefined,
        estimated: arr.estimated ?? undefined,
        lat: arrCoords?.lat,
        lng: arrCoords?.lng,
      },
    };

    if (flight.aircraft) {
      result.aircraft = {
        registration: flight.aircraft.registration ?? undefined,
        iata: flight.aircraft.iata ?? undefined,
        icao24: flight.aircraft.icao24 ?? undefined,
      };
    }

    if (flight.live?.latitude != null && flight.live?.longitude != null) {
      result.live = {
        latitude: flight.live.latitude,
        longitude: flight.live.longitude,
        altitude: flight.live.altitude ?? 0,
        direction: flight.live.direction ?? 0,
        speed_horizontal: flight.live.speed_horizontal ?? 0,
      };
    }

    logger.info('getFlightInfo: done', { flightNumber: result.flightNumber, status: result.status });
    return result;
  }
);
```

- [ ] **Step 2: Export from main.ts**

In `apps/functions/src/main.ts`, add after the location export line:

```typescript
import * as Flighttracker from './flighttracker';
```

And at the bottom of the exports list:

```typescript
// flight tracker
export const getFlightInfo = Flighttracker.getFlightInfo;
```

- [ ] **Step 3: Build functions to verify no compile errors**

```bash
pnpm nx build functions --configuration production
```

Expected: build completes without TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add apps/functions/src/flighttracker/index.ts apps/functions/src/main.ts
git commit -m "feat(functions): add getFlightInfo cloud function with airport Firestore cache"
```

---

## Task 3: Scaffold `data-access` lib

**Files:**
- Create all files under `libs/geo/flighttracker/data-access/`
- Modify: `tsconfig.base.json`

- [ ] **Step 1: Create project.json**

Create `libs/geo/flighttracker/data-access/project.json`:

```json
{
  "name": "flighttracker-data-access",
  "$schema": "../../../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "libs/geo/flighttracker/data-access/src",
  "prefix": "bk",
  "projectType": "library",
  "tags": ["type:data-access", "scope:flighttracker", "platform:mobile", "platform:web"],
  "targets": {
    "build": {
      "executor": "@nx/js:tsc",
      "outputs": ["{options.outputPath}"],
      "options": {
        "outputPath": "dist/libs/flighttracker/data-access",
        "main": "libs/geo/flighttracker/data-access/src/index.ts",
        "tsConfig": "libs/geo/flighttracker/data-access/tsconfig.lib.json",
        "assets": ["libs/geo/flighttracker/data-access/*.md"],
        "updateBuildableProjectDepsInPackageJson": false
      }
    },
    "lint": {
      "executor": "@nx/eslint:lint"
    }
  }
}
```

- [ ] **Step 2: Create README.md**

Create `libs/geo/flighttracker/data-access/README.md`:

```markdown
# flighttracker-data-access

Data-access layer for the flight tracker feature. Wraps the `getFlightInfo` Firebase Cloud Function callable.
```

- [ ] **Step 3: Create tsconfig.json**

Create `libs/geo/flighttracker/data-access/tsconfig.json`:

```json
{
  "extends": "../../../../tsconfig.base.json",
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
  "references": []
}
```

- [ ] **Step 4: Create tsconfig.lib.json**

Create `libs/geo/flighttracker/data-access/tsconfig.lib.json`:

```json
{
  "extends": "../../../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "../../../../dist/libs/flighttracker/data-access",
    "declaration": true,
    "composite": true,
    "module": "es2020",
    "target": "es2020",
    "types": [],
    "tsBuildInfoFile": "../../../../dist/out-tsc/flighttracker-data-access.tsbuildinfo"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["**/*.spec.ts", "**/*.spec2.ts", "**/test-setup.ts", "vite.config.ts"]
}
```

- [ ] **Step 5: Create package.json**

Create `libs/geo/flighttracker/data-access/package.json`:

```json
{
  "name": "@bk2/flighttracker-data-access",
  "version": "0.0.1",
  "main": "./src/index.js",
  "types": "./src/index.d.ts",
  "sideEffects": false,
  "private": true,
  "dependencies": {
    "tslib": "^2.8.1"
  }
}
```

- [ ] **Step 6: Create FlightTrackerService**

Create `libs/geo/flighttracker/data-access/src/lib/flighttracker.service.ts`:

```typescript
import { Injectable } from '@angular/core';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getApp } from 'firebase/app';

export interface FlightInfoRequest {
  flightNumber: string;
  date: string;
}

export interface FlightEndpoint {
  airport: string;
  iata: string;
  terminal?: string;
  gate?: string;
  delay?: number;
  scheduled?: string;
  estimated?: string;
  lat?: number;
  lng?: number;
}

export interface FlightAircraft {
  registration?: string;
  iata?: string;
  icao24?: string;
}

export interface FlightLivePosition {
  latitude: number;
  longitude: number;
  altitude: number;
  direction: number;
  speed_horizontal: number;
}

export interface FlightInfoResponse {
  flightNumber: string;
  status: string;
  departure: FlightEndpoint;
  arrival: FlightEndpoint;
  aircraft?: FlightAircraft;
  live?: FlightLivePosition;
}

@Injectable({ providedIn: 'root' })
export class FlightTrackerService {
  public async getFlightInfo(flightNumber: string, date: string): Promise<FlightInfoResponse> {
    const fn = httpsCallable<FlightInfoRequest, FlightInfoResponse>(
      getFunctions(getApp(), 'europe-west6'),
      'getFlightInfo'
    );
    const { data } = await fn({ flightNumber, date });
    return data;
  }
}
```

- [ ] **Step 7: Create src/index.ts**

Create `libs/geo/flighttracker/data-access/src/index.ts`:

```typescript
export * from './lib/flighttracker.service';
```

- [ ] **Step 8: Add path alias to tsconfig.base.json**

In `tsconfig.base.json`, inside the `"paths"` object, add after the `location` entries (around line 88-91):

```json
"@bk2/flighttracker-data-access": ["libs/geo/flighttracker/data-access/src/index.ts"],
```

- [ ] **Step 9: Type-check the data-access lib**

```bash
npx tsc --noEmit -p libs/geo/flighttracker/data-access/tsconfig.json
```

Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add libs/geo/flighttracker/data-access/ tsconfig.base.json
git commit -m "feat(flighttracker): scaffold data-access lib with FlightTrackerService"
```

---

## Task 4: Scaffold `feature` lib + `FlightTrackerStore`

**Files:**
- Create all config files under `libs/geo/flighttracker/feature/`
- Create `libs/geo/flighttracker/feature/src/lib/flighttracker.store.ts`
- Modify: `tsconfig.base.json`

- [ ] **Step 1: Create project.json**

Create `libs/geo/flighttracker/feature/project.json`:

```json
{
  "name": "flighttracker-feature",
  "$schema": "../../../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "libs/geo/flighttracker/feature/src",
  "prefix": "bk",
  "projectType": "library",
  "tags": ["type:feature", "scope:flighttracker", "platform:mobile", "platform:web"],
  "targets": {
    "build": {
      "executor": "@nx/js:tsc",
      "outputs": ["{options.outputPath}"],
      "options": {
        "outputPath": "dist/libs/flighttracker/feature",
        "main": "libs/geo/flighttracker/feature/src/index.ts",
        "tsConfig": "libs/geo/flighttracker/feature/tsconfig.lib.json",
        "assets": ["libs/geo/flighttracker/feature/*.md"],
        "updateBuildableProjectDepsInPackageJson": false
      }
    },
    "lint": {
      "executor": "@nx/eslint:lint"
    }
  }
}
```

- [ ] **Step 2: Create README.md**

Create `libs/geo/flighttracker/feature/README.md`:

```markdown
# flighttracker-feature

Feature lib for the flight tracker. Contains the store, search page component, and detail modal.
```

- [ ] **Step 3: Create tsconfig.json**

Create `libs/geo/flighttracker/feature/tsconfig.json`:

```json
{
  "extends": "../../../../tsconfig.base.json",
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
    {"path": "../../../shared/config/tsconfig.lib.json"},
    {"path": "../../../shared/i18n/tsconfig.lib.json"},
    {"path": "../../../shared/pipes/tsconfig.lib.json"},
    {"path": "../../../shared/ui/tsconfig.lib.json"},
    {"path": "../../../shared/util-core/tsconfig.lib.json"},
    {"path": "../../../shared/util-angular/tsconfig.lib.json"},
    {"path": "../data-access/tsconfig.lib.json"}
  ]
}
```

- [ ] **Step 4: Create tsconfig.lib.json**

Create `libs/geo/flighttracker/feature/tsconfig.lib.json`:

```json
{
  "extends": "../../../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "../../../../dist/libs/flighttracker/feature",
    "declaration": true,
    "composite": true,
    "module": "es2020",
    "target": "es2020",
    "types": [],
    "tsBuildInfoFile": "../../../../dist/out-tsc/flighttracker-feature.tsbuildinfo"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["**/*.spec.ts", "**/*.spec2.ts", "**/test-setup.ts", "vite.config.ts"]
}
```

- [ ] **Step 5: Create package.json**

Create `libs/geo/flighttracker/feature/package.json`:

```json
{
  "name": "@bk2/flighttracker-feature",
  "version": "0.0.1",
  "main": "./src/index.js",
  "types": "./src/index.d.ts",
  "sideEffects": false,
  "private": true,
  "dependencies": {
    "tslib": "^2.8.1",
    "@bk2/shared-config": "*",
    "@bk2/shared-i18n": "*",
    "@bk2/shared-pipes": "*",
    "@bk2/shared-ui": "*",
    "@bk2/shared-util-angular": "*",
    "@bk2/shared-util-core": "*",
    "@bk2/flighttracker-data-access": "*"
  }
}
```

- [ ] **Step 6: Create FlightTrackerStore**

Create `libs/geo/flighttracker/feature/src/lib/flighttracker.store.ts`:

```typescript
import { inject } from '@angular/core';
import { patchState, signalStore, withMethods, withProps, withState } from '@ngrx/signals';

import { FlightInfoResponse, FlightTrackerService } from '@bk2/flighttracker-data-access';

export type FlightTrackerState = {
  flightNumber: string;
  date: string;
  flightData: FlightInfoResponse | null;
  isLoading: boolean;
  error: string | null;
};

const today = (): string => new Date().toISOString().split('T')[0];

const initialState: FlightTrackerState = {
  flightNumber: '',
  date: today(),
  flightData: null,
  isLoading: false,
  error: null,
};

export const FlightTrackerStore = signalStore(
  withState(initialState),
  withProps(() => ({
    flightTrackerService: inject(FlightTrackerService),
  })),
  withMethods((store) => ({
    setFlightNumber(flightNumber: string): void {
      patchState(store, { flightNumber });
    },

    setDate(date: string): void {
      patchState(store, { date });
    },

    async search(): Promise<void> {
      if (!store.flightNumber().trim()) return;
      patchState(store, { isLoading: true, error: null, flightData: null });
      try {
        const data = await store.flightTrackerService.getFlightInfo(
          store.flightNumber().trim(),
          store.date()
        );
        patchState(store, { flightData: data, isLoading: false });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : '@flighttracker.error.generic';
        patchState(store, { error: message, isLoading: false });
      }
    },

    async reload(): Promise<void> {
      return this.search();
    },
  }))
);
```

- [ ] **Step 7: Create placeholder src/index.ts**

Create `libs/geo/flighttracker/feature/src/index.ts`:

```typescript
export * from './lib/flighttracker.store';
```

- [ ] **Step 8: Add path alias to tsconfig.base.json**

In `tsconfig.base.json`, inside the `"paths"` object, add after the `flighttracker-data-access` entry:

```json
"@bk2/flighttracker-feature": ["libs/geo/flighttracker/feature/src/index.ts"],
```

- [ ] **Step 9: Type-check feature lib**

```bash
npx tsc --noEmit -p libs/geo/flighttracker/feature/tsconfig.json
```

Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add libs/geo/flighttracker/feature/ tsconfig.base.json
git commit -m "feat(flighttracker): scaffold feature lib with FlightTrackerStore"
```

---

## Task 5: `FlightDetailModal`

**Files:**
- Create: `libs/geo/flighttracker/feature/src/lib/flighttracker-detail.modal.ts`
- Modify: `libs/geo/flighttracker/feature/src/index.ts`

- [ ] **Step 1: Create the modal component**

Create `libs/geo/flighttracker/feature/src/lib/flighttracker-detail.modal.ts`:

```typescript
import { AsyncPipe, DecimalPipe } from '@angular/common';
import { Component, inject, input } from '@angular/core';
import {
  IonCol, IonContent, IonGrid, IonItem, IonLabel, IonRow,
  ModalController
} from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { HeaderComponent } from '@bk2/shared-ui';

import { FlightInfoResponse } from '@bk2/flighttracker-data-access';

@Component({
  selector: 'bk-flighttracker-detail-modal',
  standalone: true,
  imports: [
    AsyncPipe, DecimalPipe, TranslatePipe,
    HeaderComponent,
    IonContent, IonGrid, IonRow, IonCol, IonItem, IonLabel
  ],
  template: `
    <bk-header title="@flighttracker.detail.title" [isModal]="true" />
    <ion-content>
      <ion-grid>
        <!-- Departure -->
        <ion-row>
          <ion-col size="12">
            <ion-item lines="none" color="primary">
              <ion-label><strong>{{ '@flighttracker.detail.departure' | translate | async }}</strong></ion-label>
            </ion-item>
          </ion-col>
        </ion-row>
        <ion-row>
          <ion-col size="6"><ion-item lines="none"><ion-label>{{ '@flighttracker.detail.airport' | translate | async }}: {{ data().departure.airport }}</ion-label></ion-item></ion-col>
          <ion-col size="6"><ion-item lines="none"><ion-label>IATA: {{ data().departure.iata }}</ion-label></ion-item></ion-col>
        </ion-row>
        <ion-row>
          <ion-col size="6"><ion-item lines="none"><ion-label>{{ '@flighttracker.detail.terminal' | translate | async }}: {{ data().departure.terminal ?? '—' }}</ion-label></ion-item></ion-col>
          <ion-col size="6"><ion-item lines="none"><ion-label>{{ '@flighttracker.detail.gate' | translate | async }}: {{ data().departure.gate ?? '—' }}</ion-label></ion-item></ion-col>
        </ion-row>
        <ion-row>
          <ion-col size="6"><ion-item lines="none"><ion-label>{{ '@flighttracker.detail.delay' | translate | async }}: {{ data().departure.delay != null ? (data().departure.delay + ' min') : '—' }}</ion-label></ion-item></ion-col>
          <ion-col size="6"><ion-item lines="none"><ion-label>{{ '@flighttracker.detail.scheduled' | translate | async }}: {{ data().departure.scheduled ?? '—' }}</ion-label></ion-item></ion-col>
        </ion-row>
        <ion-row>
          <ion-col size="12"><ion-item lines="none"><ion-label>{{ '@flighttracker.detail.estimated' | translate | async }}: {{ data().departure.estimated ?? '—' }}</ion-label></ion-item></ion-col>
        </ion-row>

        <!-- Arrival -->
        <ion-row>
          <ion-col size="12">
            <ion-item lines="none" color="primary">
              <ion-label><strong>{{ '@flighttracker.detail.arrival' | translate | async }}</strong></ion-label>
            </ion-item>
          </ion-col>
        </ion-row>
        <ion-row>
          <ion-col size="6"><ion-item lines="none"><ion-label>{{ '@flighttracker.detail.airport' | translate | async }}: {{ data().arrival.airport }}</ion-label></ion-item></ion-col>
          <ion-col size="6"><ion-item lines="none"><ion-label>IATA: {{ data().arrival.iata }}</ion-label></ion-item></ion-col>
        </ion-row>
        <ion-row>
          <ion-col size="6"><ion-item lines="none"><ion-label>{{ '@flighttracker.detail.terminal' | translate | async }}: {{ data().arrival.terminal ?? '—' }}</ion-label></ion-item></ion-col>
          <ion-col size="6"><ion-item lines="none"><ion-label>{{ '@flighttracker.detail.gate' | translate | async }}: {{ data().arrival.gate ?? '—' }}</ion-label></ion-item></ion-col>
        </ion-row>
        <ion-row>
          <ion-col size="6"><ion-item lines="none"><ion-label>{{ '@flighttracker.detail.delay' | translate | async }}: {{ data().arrival.delay != null ? (data().arrival.delay + ' min') : '—' }}</ion-label></ion-item></ion-col>
          <ion-col size="6"><ion-item lines="none"><ion-label>{{ '@flighttracker.detail.scheduled' | translate | async }}: {{ data().arrival.scheduled ?? '—' }}</ion-label></ion-item></ion-col>
        </ion-row>
        <ion-row>
          <ion-col size="12"><ion-item lines="none"><ion-label>{{ '@flighttracker.detail.estimated' | translate | async }}: {{ data().arrival.estimated ?? '—' }}</ion-label></ion-item></ion-col>
        </ion-row>

        <!-- Aircraft (hidden if null) -->
        @if (data().aircraft) {
          <ion-row>
            <ion-col size="12">
              <ion-item lines="none" color="primary">
                <ion-label><strong>{{ '@flighttracker.detail.aircraft' | translate | async }}</strong></ion-label>
              </ion-item>
            </ion-col>
          </ion-row>
          <ion-row>
            <ion-col size="6"><ion-item lines="none"><ion-label>{{ '@flighttracker.detail.registration' | translate | async }}: {{ data().aircraft!.registration ?? '—' }}</ion-label></ion-item></ion-col>
            <ion-col size="6"><ion-item lines="none"><ion-label>IATA: {{ data().aircraft!.iata ?? '—' }}</ion-label></ion-item></ion-col>
          </ion-row>
          <ion-row>
            <ion-col size="12"><ion-item lines="none"><ion-label>ICAO24: {{ data().aircraft!.icao24 ?? '—' }}</ion-label></ion-item></ion-col>
          </ion-row>
        }

        <!-- Live Position (hidden if null) -->
        @if (data().live) {
          <ion-row>
            <ion-col size="12">
              <ion-item lines="none" color="primary">
                <ion-label><strong>{{ '@flighttracker.detail.live' | translate | async }}</strong></ion-label>
              </ion-item>
            </ion-col>
          </ion-row>
          <ion-row>
            <ion-col size="4"><ion-item lines="none"><ion-label>{{ '@flighttracker.detail.altitude' | translate | async }}: {{ data().live!.altitude | number:'1.0-0' }} ft</ion-label></ion-item></ion-col>
            <ion-col size="4"><ion-item lines="none"><ion-label>{{ '@flighttracker.detail.direction' | translate | async }}: {{ data().live!.direction }}°</ion-label></ion-item></ion-col>
            <ion-col size="4"><ion-item lines="none"><ion-label>{{ '@flighttracker.detail.speed' | translate | async }}: {{ data().live!.speed_horizontal | number:'1.0-0' }} kn</ion-label></ion-item></ion-col>
          </ion-row>
        }
      </ion-grid>
    </ion-content>
  `
})
export class FlightDetailModal {
  private modalController = inject(ModalController);

  public data = input.required<FlightInfoResponse>();

  protected close(): void {
    this.modalController.dismiss();
  }
}
```

- [ ] **Step 2: Export from index.ts**

Replace `libs/geo/flighttracker/feature/src/index.ts` with:

```typescript
export * from './lib/flighttracker.store';
export * from './lib/flighttracker-detail.modal';
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit -p libs/geo/flighttracker/feature/tsconfig.json
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add libs/geo/flighttracker/feature/src/
git commit -m "feat(flighttracker): add FlightDetailModal"
```

---

## Task 6: `FlightTrackerSearchComponent`

**Files:**
- Create: `libs/geo/flighttracker/feature/src/lib/flighttracker-search.component.ts`
- Modify: `libs/geo/flighttracker/feature/src/index.ts`

- [ ] **Step 1: Create the component**

Create `libs/geo/flighttracker/feature/src/lib/flighttracker-search.component.ts`:

```typescript
import { AsyncPipe, DecimalPipe } from '@angular/common';
import {
  AfterViewInit, CUSTOM_ELEMENTS_SCHEMA, Component, OnDestroy,
  PLATFORM_ID, computed, effect, inject
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import {
  IonBackdrop, IonBadge, IonButton, IonButtons, IonContent, IonHeader,
  IonIcon, IonInput, IonItem, IonLabel, IonMenuButton, IonNote,
  IonTitle, IonToolbar, ModalController
} from '@ionic/angular/standalone';

import { ENV } from '@bk2/shared-config';
import { TranslatePipe } from '@bk2/shared-i18n';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { SpinnerComponent } from '@bk2/shared-ui';

import { FlightInfoResponse } from '@bk2/flighttracker-data-access';
import { FlightDetailModal } from './flighttracker-detail.modal';
import { FlightTrackerStore } from './flighttracker.store';

// Plane icon as inline SVG data URI — rotated 45° to point right
const PLANE_ICON_URL =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="36" height="36">' +
    '<path fill="%233880ff" d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/>' +
    '</svg>'
  );

let GoogleMap: any;
let MapType: any;

if (typeof window !== 'undefined') {
  import('@capacitor/google-maps').then((m) => {
    GoogleMap = m.GoogleMap;
    MapType = m.MapType;
  });
}

function zoomForBounds(latSpan: number, lngSpan: number): number {
  const span = Math.max(latSpan, lngSpan);
  if (span === 0) return 5;
  return Math.min(13, Math.max(2, Math.round(Math.log2(360 / span)) - 1));
}

@Component({
  selector: 'bk-flighttracker-search',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  providers: [FlightTrackerStore],
  styles: [`
    .map-container {
      width: 100%;
      height: calc(100% - 44px);
      min-height: 300px;
      position: relative;
    }
    capacitor-google-map {
      width: 100%;
      height: 100%;
      display: block;
    }
    .map-prompt {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(0,0,0,0.04);
      z-index: 10;
      pointer-events: none;
    }
  `],
  imports: [
    AsyncPipe, DecimalPipe, TranslatePipe, SvgIconPipe,
    SpinnerComponent,
    IonHeader, IonToolbar, IonTitle, IonButtons, IonMenuButton,
    IonButton, IonIcon, IonInput, IonItem, IonLabel, IonNote,
    IonBadge, IonContent, IonBackdrop
  ],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
        <ion-title>{{ '@flighttracker.title' | translate | async }}</ion-title>
      </ion-toolbar>

      <ion-toolbar>
        <ion-item lines="none">
          <ion-input
            type="text"
            [value]="flightNumber()"
            placeholder="{{ '@flighttracker.search.placeholder' | translate | async }}"
            (ionInput)="onFlightNumberInput($event)"
            (keyup.enter)="onSearch()"
          />
          <ion-input
            type="date"
            [value]="date()"
            (ionInput)="onDateInput($event)"
            style="max-width: 145px"
          />
          <ion-button slot="end" (click)="onSearch()" [disabled]="isLoading() || !flightNumber().trim()">
            {{ '@flighttracker.search.button' | translate | async }}
          </ion-button>
          <ion-button slot="end" fill="outline" (click)="onReload()" [disabled]="isLoading() || !flightData()">
            <ion-icon slot="icon-only" src="{{'refresh' | svgIcon}}" />
          </ion-button>
        </ion-item>
      </ion-toolbar>

      @if (flightData(); as fd) {
        <ion-toolbar>
          <ion-item lines="none">
            <ion-badge [color]="statusColor(fd.status)" slot="start">{{ fd.status }}</ion-badge>
            <ion-label>{{ fd.flightNumber }} &nbsp; {{ fd.departure.iata }} → {{ fd.arrival.iata }}</ion-label>
            @if (fd.live) {
              <ion-label slot="end" class="ion-hide-sm-down">
                {{ fd.live.altitude | number:'1.0-0' }} ft &nbsp;·&nbsp;
                {{ fd.live.speed_horizontal | number:'1.0-0' }} kn &nbsp;·&nbsp;
                {{ fd.live.direction }}°
              </ion-label>
            }
          </ion-item>
        </ion-toolbar>
      }
    </ion-header>

    <ion-content>
      @if (isLoading()) {
        <bk-spinner />
        <ion-backdrop />
      }
      @if (error(); as err) {
        <ion-note color="danger" style="padding: 12px; display: block;">{{ err }}</ion-note>
      }
      <div class="map-container">
        @if (!flightData() && !isLoading()) {
          <div class="map-prompt">
            <ion-note>{{ '@flighttracker.search.prompt' | translate | async }}</ion-note>
          </div>
        }
        <capacitor-google-map [id]="mapId" />
      </div>
    </ion-content>
  `
})
export class FlightTrackerSearchComponent implements AfterViewInit, OnDestroy {
  private readonly env = inject(ENV);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly modalController = inject(ModalController);

  protected readonly store = inject(FlightTrackerStore);
  protected readonly flightNumber = computed(() => this.store.flightNumber());
  protected readonly date = computed(() => this.store.date());
  protected readonly flightData = computed(() => this.store.flightData());
  protected readonly isLoading = computed(() => this.store.isLoading());
  protected readonly error = computed(() => this.store.error());

  protected readonly mapId = 'bk-flighttracker-map';

  private map: any;
  private markerIds: string[] = [];
  private planeMarkerId: string | null = null;
  private resizeObserver?: ResizeObserver;

  constructor() {
    effect(() => {
      const data = this.store.flightData();
      if (this.map) {
        void this.onFlightDataChanged(data);
      }
    });
  }

  async ngAfterViewInit(): Promise<void> {
    if (isPlatformBrowser(this.platformId)) {
      await this.loadMap();
    }
  }

  ngOnDestroy(): void {
    this.map?.destroy();
    this.resizeObserver?.disconnect();
  }

  protected onFlightNumberInput(event: Event): void {
    this.store.setFlightNumber((event as CustomEvent).detail.value ?? '');
  }

  protected onDateInput(event: Event): void {
    this.store.setDate((event as CustomEvent).detail.value ?? '');
  }

  protected onSearch(): void {
    void this.store.search();
  }

  protected onReload(): void {
    void this.store.reload();
  }

  protected statusColor(status: string): string {
    switch (status) {
      case 'active': return 'success';
      case 'scheduled': return 'primary';
      case 'landed': return 'medium';
      case 'cancelled': return 'danger';
      default: return 'warning';
    }
  }

  private async loadMap(): Promise<void> {
    const mapRef = document.getElementById(this.mapId);
    if (!mapRef) return;
    await this.waitForMapDimensions(mapRef);
    this.map = await GoogleMap.create({
      id: this.mapId,
      element: mapRef,
      apiKey: this.env.services.gmapKey,
      config: { center: { lat: 47.5, lng: 8.7 }, zoom: 4 },
    });
    await this.map.setMapType(MapType.Normal);
    await this.map.setOnMarkerClickListener(async (event: any) => {
      if (event.markerId === this.planeMarkerId) {
        await this.openDetailModal();
      }
    });
    // Render data if search completed before map was ready
    const data = this.store.flightData();
    if (data) {
      await this.onFlightDataChanged(data);
    }
  }

  private async onFlightDataChanged(data: FlightInfoResponse | null): Promise<void> {
    await this.clearMarkers();
    if (!data) return;
    await this.addAirportMarker(data.departure.lat, data.departure.lng, data.departure.iata, data.departure.airport);
    await this.addAirportMarker(data.arrival.lat, data.arrival.lng, data.arrival.iata, data.arrival.airport);
    if (data.live) {
      this.planeMarkerId = await this.map.addMarker({
        coordinate: { lat: data.live.latitude, lng: data.live.longitude },
        title: data.flightNumber,
        snippet: `${data.live.altitude.toFixed(0)} ft · ${data.live.speed_horizontal.toFixed(0)} kn`,
        iconUrl: PLANE_ICON_URL,
      });
      this.markerIds.push(this.planeMarkerId!);
    }
    await this.fitCameraToMarkers(data);
  }

  private async addAirportMarker(
    lat: number | undefined,
    lng: number | undefined,
    title: string,
    snippet: string
  ): Promise<void> {
    if (lat == null || lng == null) return;
    const id = await this.map.addMarker({ coordinate: { lat, lng }, title, snippet });
    this.markerIds.push(id);
  }

  private async clearMarkers(): Promise<void> {
    for (const id of this.markerIds) {
      try { await this.map.removeMarker(id); } catch { /* ignore */ }
    }
    this.markerIds = [];
    this.planeMarkerId = null;
  }

  private async fitCameraToMarkers(data: FlightInfoResponse): Promise<void> {
    const lats: number[] = [];
    const lngs: number[] = [];
    if (data.departure.lat != null && data.departure.lng != null) {
      lats.push(data.departure.lat); lngs.push(data.departure.lng);
    }
    if (data.arrival.lat != null && data.arrival.lng != null) {
      lats.push(data.arrival.lat); lngs.push(data.arrival.lng);
    }
    if (data.live) {
      lats.push(data.live.latitude); lngs.push(data.live.longitude);
    }
    if (lats.length === 0) return;
    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
    const zoom = zoomForBounds(maxLat - minLat, maxLng - minLng);
    await this.map.setCamera({
      coordinate: { lat: (minLat + maxLat) / 2, lng: (minLng + maxLng) / 2 },
      zoom,
    });
  }

  private async openDetailModal(): Promise<void> {
    const data = this.store.flightData();
    if (!data) return;
    const modal = await this.modalController.create({
      component: FlightDetailModal,
      componentProps: { data },
    });
    await modal.present();
  }

  private waitForMapDimensions(mapRef: HTMLElement): Promise<void> {
    return new Promise((resolve, reject) => {
      const maxTimeout = 2000;
      this.resizeObserver = new ResizeObserver((entries) => {
        const rect = entries[0].contentRect;
        if (rect.width > 0 && rect.height > 0) {
          this.resizeObserver?.disconnect();
          resolve();
        }
      });
      this.resizeObserver.observe(mapRef);
      setTimeout(() => {
        const rect = mapRef.getBoundingClientRect();
        this.resizeObserver?.disconnect();
        if (rect.width > 0 && rect.height > 0) resolve();
        else reject(new Error('Map element has no dimensions after 2s'));
      }, maxTimeout);
    });
  }
}
```

- [ ] **Step 2: Export from index.ts**

Replace `libs/geo/flighttracker/feature/src/index.ts` with:

```typescript
export * from './lib/flighttracker.store';
export * from './lib/flighttracker-detail.modal';
export * from './lib/flighttracker-search.component';
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit -p libs/geo/flighttracker/feature/tsconfig.json
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add libs/geo/flighttracker/feature/src/
git commit -m "feat(flighttracker): add FlightTrackerSearchComponent with map and markers"
```

---

## Task 7: Route + i18n

**Files:**
- Modify: `apps/scs-app/src/app/app.routes.ts`
- Modify: `apps/scs-app/src/assets/i18n/de.json`

- [ ] **Step 1: Add route**

In `apps/scs-app/src/app/app.routes.ts`, add after the `location` route block (after line ~222):

```typescript
  {
    path: 'flighttracker',
    canActivate: [isAuthenticatedGuard],
    loadComponent: () =>
      import('@bk2/flighttracker-feature').then(m => m.FlightTrackerSearchComponent),
  },
```

- [ ] **Step 2: Add i18n keys**

In `apps/scs-app/src/assets/i18n/de.json`, add a new top-level `"flighttracker"` key. Find a suitable location (e.g. after `"location": {...}` at line ~5811) and add:

```json
"flighttracker": {
  "title": "Flugradar",
  "search": {
    "placeholder": "Flugnummer (z.B. LX1234)",
    "button": "Suchen",
    "prompt": "Flugnummer eingeben und auf Suchen drücken."
  },
  "reload": "Aktualisieren",
  "status": {
    "active": "Aktiv",
    "scheduled": "Geplant",
    "landed": "Gelandet",
    "cancelled": "Annulliert",
    "unknown": "Unbekannt"
  },
  "detail": {
    "title": "Flugdetails",
    "departure": "Abflug",
    "arrival": "Ankunft",
    "aircraft": "Flugzeug",
    "live": "Live Position",
    "airport": "Flughafen",
    "terminal": "Terminal",
    "gate": "Gate",
    "delay": "Verspätung",
    "scheduled": "Geplant",
    "estimated": "Erwartet",
    "registration": "Kennzeichen",
    "altitude": "Höhe",
    "direction": "Kurs",
    "speed": "Geschwindigkeit"
  },
  "error": {
    "notFound": "Flug nicht gefunden.",
    "generic": "Fehler beim Abrufen der Flugdaten."
  }
}
```

- [ ] **Step 3: Type-check scs-app**

```bash
npx tsc --noEmit -p apps/scs-app/tsconfig.app.json
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/scs-app/src/app/app.routes.ts apps/scs-app/src/assets/i18n/de.json
git commit -m "feat(flighttracker): add route and German i18n strings"
```

---

## Task 8: Build verification

**Files:** no new files

- [ ] **Step 1: Build data-access lib**

```bash
pnpm nx build flighttracker-data-access
```

Expected: outputs to `dist/libs/flighttracker/data-access/` with no errors.

- [ ] **Step 2: Build feature lib**

```bash
pnpm nx build flighttracker-feature
```

Expected: outputs to `dist/libs/flighttracker/feature/` with no errors.

- [ ] **Step 3: Build scs-app**

```bash
pnpm nx build scs-app
```

Expected: build completes without errors. No `*.d.ts`, `*.js`, or `*.js.map` files should appear under `libs/`.

- [ ] **Step 4: Serve and smoke-test**

```bash
pnpm nx serve scs-app
```

Navigate to `http://localhost:4200/flighttracker` after login. Verify:
- Page loads with the search toolbar and an empty map
- Entering a flight number (e.g. `LX8`) and today's date, clicking Search shows the spinner then the map with markers
- If the flight is active, a plane marker appears; tapping it opens the detail modal with all sections
- If the flight is not airborne, only dep/arr markers appear and the status bar shows the correct status
- Reload button refreshes data

- [ ] **Step 5: Commit final state**

```bash
git add .
git commit -m "feat(flighttracker): complete flight tracker feature"
```

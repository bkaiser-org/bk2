# spec-pwa-caching.md

**Status:** Draft
**Scope:** bk2 PWA shell caching for Angular (standalone) + Ionic on Firebase Hosting
**Owner:** Bruno
**Related:** `error-monitoring.md`, `spec-sentry-integration.md`

-----

## 1. Problem

On iOS, the bk2 app reloads from scratch every time Safari is returned to from the background. This is **not** a bug or a caching gap — it is iOS memory management. When Safari is backgrounded, iOS evicts the page from memory; on resume it re-requests `index.html` and re-bootstraps the app.

The forced reload cannot be prevented from web code. It can, however, be made **fast** (served from local cache instead of network) and optionally **invisible** (UI state restored on boot). This spec covers the first; state persistence is noted in §6 as a follow-up.

## 2. Decision

- Use `@angular/service-worker` (ngsw) to cache the app shell and static assets. Reloads are served from the Cache Storage API, not the network.
- Scope the service worker to the **shell only**. Firestore data and Firebase Auth tokens are explicitly excluded (§4).
- Pair ngsw with Firebase Hosting cache headers so hashed assets are immutable while the three control files revalidate on every deploy (§5).
- No `dataGroups`. Firestore offline persistence (`persistentLocalCache`) owns data freshness.

## 3. Registration

`app.config.ts` — standalone provider:

```ts
import { provideServiceWorker } from '@angular/service-worker';
import { isDevMode } from '@angular/core';

provideServiceWorker('ngsw-worker.js', {
  enabled: !isDevMode(),
  registrationStrategy: 'registerWhenStable:30000',
});
```

`enabled: !isDevMode()` keeps the worker out of `ng serve`. `registerWhenStable:30000` defers registration until the app is stable (or 30s elapses), avoiding contention with first paint.

## 4. ngsw-config.json

```json
{
  "$schema": "./node_modules/@angular/service-worker/config/schema.json",
  "index": "/index.html",
  "assetGroups": [
    {
      "name": "app-shell",
      "installMode": "prefetch",
      "updateMode": "prefetch",
      "resources": {
        "files": [
          "/index.html",
          "/manifest.webmanifest",
          "/favicon.ico",
          "/*.css",
          "/*.js"
        ]
      }
    },
    {
      "name": "assets",
      "installMode": "lazy",
      "updateMode": "prefetch",
      "resources": {
        "files": [
          "/assets/**",
          "/svg/**",
          "/*.(svg|png|jpg|jpeg|webp|avif|gif|ico|otf|ttf|woff|woff2)"
        ]
      }
    }
  ]
}
```

**Ionic-specific notes:**

- `/svg/**` is required. ionicons are fetched lazily at runtime; without this glob, icons break on a cold/offline load.
- Hashed `@ionic/angular` JS/CSS chunks are already covered by `/*.js` and `/*.css` in the shell group.

**Deliberately excluded — do not add a `dataGroups` block:**

- **Firestore** runs over `firestore.googleapis.com` (cross-origin; ngsw would not intercept it regardless) and maintains its own IndexedDB cache. Use `persistentLocalCache` / `persistentMultipleTabManager` in the Firestore init and let the SDK own data freshness.
- **Auth** — never cache `identitytoolkit.googleapis.com` or `securetoken.googleapis.com` responses.

## 5. firebase.json headers

Principle: content-hashed assets are immutable and cached for a year; the control files (`index.html`, `ngsw-worker.js`, `ngsw.json`, manifest) must revalidate so deploys propagate instead of iOS pinning a stale worker.

```json
{
  "hosting": {
    "public": "dist/bk2/browser",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "rewrites": [{ "source": "**", "destination": "/index.html" }],
    "headers": [
      {
        "source": "/@(index.html|ngsw-worker.js|ngsw.json|manifest.webmanifest|safety-worker.js)",
        "headers": [{ "key": "Cache-Control", "value": "no-cache" }]
      },
      {
        "source": "**/*.@(js|css)",
        "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }]
      },
      {
        "source": "**/*.@(jpg|jpeg|png|gif|svg|webp|avif|woff|woff2|ttf|otf|ico)",
        "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }]
      }
    ]
  }
}
```

**Caveats:**

- Adjust `public` if the build output dir differs.
- `immutable` on JS/CSS is only safe because Angular prod builds content-hash filenames (`outputHashing: all`, the default). Exclude any unhashed bundle from the immutable rule.
- `no-cache` means “store but revalidate before use” — not “do not store.” Control files still benefit from 304s while staying fresh.

## 6. Update activation

Tie-in to the iOS reload behaviour: when iOS force-reloads and a new version is live, the new shell should activate cleanly rather than flash stale UI. On `VERSION_READY`, reload once.

```ts
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter } from 'rxjs/operators';

this.swUpdate.versionUpdates
  .pipe(filter((e): e is VersionReadyEvent => e.type === 'VERSION_READY'))
  .subscribe(() => document.location.reload());
```

Because iOS already reloads on resume, this generally fires at the moment it is wanted. Consider a user prompt instead of an unconditional reload if a reload could interrupt in-progress form input.

## 7. Chat module initialization

The chat module is Firestore-backed, so the **service worker does not touch it** (§4 — Firestore is cross-origin and SDK-cached). On every iOS forced reload the chat is torn down and must re-initialize from scratch: re-auth, re-attach `onSnapshot` listeners, re-render history. The levers are entirely on the Firestore + bootstrap side, not ngsw.

### 7.1 Enable Firestore persistence (the chat analogue of the shell SW)

With persistence on, re-attached listeners serve cached messages from IndexedDB **immediately** (`metadata.fromCache === true`), then reconcile deltas with the server — so the thread paints instantly on reload instead of blank-screen-plus-spinner. This is the single highest-impact change for perceived chat init speed.

Use the modular v9+ API at app bootstrap (the deprecated `enableIndexedDbPersistence()` / `enablePersistence()` should not be used):

```ts
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from '@angular/fire/firestore'; // or 'firebase/firestore'

const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});
```

`persistentMultipleTabManager()` is the safe default for a PWA that may be open in more than one tab; single-tab persistence would throw `failed-precondition` on the second tab.

### 7.2 Gate listeners on auth — the cold-reload bug

On a fresh reload, `onAuthStateChanged` resolves **asynchronously** after Firebase Auth restores its session from IndexedDB. If chat listeners attach before that resolves, they hit `permission-denied` against tenant-scoped security rules. This is the classic “chat works in normal navigation but breaks on iOS resume” symptom. Initialize chat listeners only after auth is ready:

```ts
authReady$.pipe(
  filter(user => !!user),
  switchMap(user => this.chat.attachThreadListener(tenantId, threadId)),
).subscribe();
```

### 7.3 Bound the initial query

Re-attach a `limit()`-ed, `orderBy('createdAt', 'desc')` listener (e.g. the last 30–50 messages) rather than re-streaming the whole thread. This keeps both reload latency and read cost low, and earlier messages page in on scroll. A full-history listener that re-fires on every iOS reload is the main avoidable cost here.

### 7.4 Queued sends survive the reload

With persistence enabled, a message that was mid-send when iOS killed the page is queued in IndexedDB and flushes automatically on reconnect; without persistence it is lost. Combine with optimistic local rendering so the user sees their message immediately. Use `waitForPendingWrites()` if you need to confirm flush before some follow-up action.

### 7.5 Treat ephemeral state as ephemeral

Presence and typing indicators should **not** be persisted or restored — let them re-establish naturally on reconnect. If presence uses RTDB `onDisconnect`, the reload is a clean disconnect→reconnect cycle and needs no special handling. Only durable chat state (last-read marker, scroll position) is worth persisting — see §8.

### 7.6 iOS Safari caveat

Safari may evict IndexedDB under storage pressure or prolonged disuse (ITP-related eviction). Treat the Firestore cache as a **latency optimization, not a guarantee** — the listener always reconciles against the server, so an evicted cache degrades to a normal cold fetch rather than a broken state. No code change needed; just don’t assume the cache is always warm.

## 8. State persistence (follow-up, out of scope here)

A service worker makes the reload **fast** but still resets in-memory UI state (active route, scroll position, unsaved form input, chat scroll/last-read marker per §7.5). If users report “it jumped back,” persist UI state to `localStorage` / IndexedDB and rehydrate on boot (e.g. in an `APP_INITIALIZER` or a bootstrap `effect`). With signals this is cheap. Track as a separate spec if needed.

## 9. Verification

- Build prod, serve the `browser` output locally with a static server (service workers require a real server, not `ng serve`):
  `pnpm dlx http-server -p 8080 -c-1 dist/bk2/browser`
- DevTools → Application → Service Workers: confirm `ngsw-worker.js` is activated.
- DevTools → Network → Offline: reload; shell and icons must load from cache.
- On a deploy, confirm DevTools shows the new `ngsw.json` hash and the worker updates (no stale control files).
- DevTools → Application → IndexedDB: confirm a `firestore` database exists and is populated after opening a chat thread.
- Chat reload: open a thread, background Safari on a physical iOS device, return after a minute. The thread should paint from cache near-instantly (verify via a `fromCache` log on the snapshot) and reconcile without a `permission-denied` flash.
- On a physical iOS device: confirm the reload is served from cache and lands on the correct route.

## 10. Open questions

- Should `VERSION_READY` reload unconditionally, or prompt when a form is dirty? (§6)
- Is UI-state persistence (§8) worth a dedicated spec, or is fast-reload sufficient for the current UX?
- Should chat scroll position + last-read marker be persisted (§7.5/§8), or is “jump to latest on reload” acceptable?
- Any routes that should be SSG/prerendered for first-paint (cross-reference the earlier `@angular/ssr` investigation)?
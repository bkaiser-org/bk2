# Cookie Consent — Implementation Guide

**Spec:** `docs/05_cookie-consent-specification.md`
**Library:** `@bk2/consent-data-access`, `@bk2/consent-ui`

---

## How it works

The feature is split across two Nx library layers under `libs/consent/`:

```text
libs/consent/
  data-access/    @bk2/consent-data-access
    consent.service.ts          — state, localStorage, public API
    analytics-loader.service.ts — lazy Firebase Analytics
  ui/             @bk2/consent-ui
    cookie-banner.ts            — fixed bottom overlay component
```

### Data flow

```text
User visits app
  └─ CookieBanner reads consent$.decided (via toSignal)
      ├─ false → banner shown
      └─ true  → banner hidden

User clicks "Alle akzeptieren"
  └─ ConsentService.acceptAll()
      └─ BehaviorSubject.next({ analytics: true, decided: true, ... })
          ├─ localStorage.setItem('cookie_consent_v1', ...)
          └─ consent$ emits
              └─ AnalyticsLoaderService → import('firebase/analytics') → enable
```

---

## ConsentService API

Import from `@bk2/consent-data-access`.

```ts
interface ConsentState {
  necessary: boolean;   // always true, cannot be disabled
  analytics: boolean;
  marketing: boolean;
  decided: boolean;     // false = show banner
  timestamp?: number;   // epoch ms of last change
}

// Observable — subscribe to react to changes
readonly consent$: Observable<ConsentState>;

// Synchronous reads
getState(): ConsentState
needsBanner(): boolean          // true when decided === false
hasAnalyticsConsent(): boolean
hasMarketingConsent(): boolean

// Write actions (all persist to localStorage immediately)
acceptAll(): void               // analytics + marketing = true, decided = true
rejectAll(): void               // analytics + marketing = false, decided = true
setCustom(partial): void        // granular opt-in, decided = true
reset(): void                   // clears localStorage, decided = false → banner reappears
```

**localStorage key:** `cookie_consent_v1`
**Schema migration:** bump the key suffix to `_v2` etc. when `ConsentState` shape changes.

---

## Cross-device / cross-browser behaviour

Consent is stored in `localStorage`, which is scoped to a single browser on a single device. A user who accesses the app from two different browsers or two different devices will see the banner on each one independently and must confirm twice.

**This is intentional and legally sound.** GDPR consent is a record tied to the browsing context, not the user's account. Most major sites (Google, LinkedIn, etc.) follow the same pattern.

**If cross-device sync is ever required**, consent would need to be persisted to Firestore under the user's `UserModel` (a `consentState` field). The flow would be:

1. On login: load consent from Firestore → write to `localStorage`
2. On change: write to `localStorage` → write to Firestore

Considerations before doing this:

- Requires a schema change to `UserModel` in `@bk2/shared-models`
- Anonymous users (not yet logged in) still need `localStorage` as fallback
- Adds a Firestore read/write on every consent change and on every login

**Recommendation:** Keep the current `localStorage`-only approach unless a product requirement explicitly calls for cross-device sync.

---

## Using ConsentService in other services

If a service needs to gate behaviour behind consent, subscribe to `consent$`:

```ts
@Injectable({ providedIn: 'root' })
export class MyTrackingService {
  private readonly consentService = inject(ConsentService);

  init(): void {
    this.consentService.consent$.subscribe(state => {
      if (state.analytics) {
        this.startTracking();
      } else {
        this.stopTracking();
      }
    });
  }
}
```

Register the service via `APP_BOOTSTRAP_LISTENER` in `app.config.ts` following the same pattern as `AnalyticsLoaderService`:

```ts
{
  provide: APP_BOOTSTRAP_LISTENER,
  useFactory: (platformId: object, injector: Injector) => () => {
    if (isBrowser(platformId)) {
      injector.get(MyTrackingService).init();
    }
  },
  deps: [PLATFORM_ID, Injector],
  multi: true,
},
```

---

## Wiring an app

Three changes per app:

### 1. `app.config.ts` — lazy-init Analytics after consent

```ts
import { AnalyticsLoaderService } from '@bk2/consent-data-access';

// inside providers[]:
{
  provide: APP_BOOTSTRAP_LISTENER,
  useFactory: (platformId: object, injector: Injector) => () => {
    if (isBrowser(platformId)) {
      injector.get(AnalyticsLoaderService).init();
    }
  },
  deps: [PLATFORM_ID, Injector],
  multi: true,
},
```

### 2. App root component — show banner globally

```ts
import { CookieBanner } from '@bk2/consent-ui';

// @Component imports:
imports: [..., CookieBanner]

// template — first child inside <ion-app>:
// <ion-app>
//   <bk-cookie-banner />
//   ...
// </ion-app>
```

### 3. App root component — "Cookie settings" link

```ts
import { ConsentService } from '@bk2/consent-data-access';

protected readonly consentService = inject(ConsentService);
protected openCookieSettings(): void { this.consentService.reset(); }
```

```html
<!-- inside menu ion-content, at the bottom: -->
<ion-item lines="none" button detail="false" (click)="openCookieSettings()">
  <ion-label color="medium">Cookie-Einstellungen</ion-label>
</ion-item>
```

---

## Adding a new consent category

1. Add the category to `ConsentState` in `consent.service.ts`:

```ts
export interface ConsentState {
  necessary: boolean;
  analytics: boolean;
  marketing: boolean;
  myNewCategory: boolean;   // ← add here
  decided: boolean;
  timestamp?: number;
}

export const DEFAULT_CONSENT: ConsentState = {
  necessary: true,
  analytics: false,
  marketing: false,
  myNewCategory: false,   // ← default to false (opt-in required)
  decided: false,
};
```

2. Add a query helper:

```ts
hasMyNewCategoryConsent(): boolean {
  return this.subject.getValue().myNewCategory;
}
```

3. Add a toggle to `CookieBanner` (in the Customize section):

```html
<ion-item>
  <ion-label>
    <h3>Meine neue Kategorie</h3>
    <p>Beschreibung was damit passiert</p>
  </ion-label>
  <ion-toggle
    [checked]="myNewToggle()"
    (ionChange)="myNewToggle.set($event.detail.checked)"
    slot="end"
  />
</ion-item>
```

4. Update `saveCustom()` in `cookie-banner.ts` to include the new toggle.
5. Update the cookie/storage inventory in the spec (`docs/05_cookie-consent-specification.md`, §5).
6. Bump the storage key to `cookie_consent_v2` to avoid conflicts with old stored values.

---

## SSR and Capacitor

- All `localStorage` reads/writes are guarded with `isBrowser(platformId)` — no crash on the server.
- `AnalyticsLoaderService.init()` returns immediately when `!isBrowser(platformId)`.
- `firebase/analytics` `isSupported()` returns `false` on Capacitor native — analytics simply does not initialize. The banner still shows and toggles still work for the web view.

---

## Testing

Unit tests live in `libs/consent/data-access/src/lib/consent.service.spec.ts`.

```bash
# run consent service tests
pnpm nx test consent-data-access

# run with coverage
pnpm nx test consent-data-access --coverage
```

Tests use Angular `TestBed` with `PLATFORM_ID` stubbed to `'browser'` or `'server'`. `localStorage` is cleared in `beforeEach`/`afterEach` via `localStorage.clear()` (available in the jsdom test environment).

---

## Cookie and storage inventory

### Where the inventory lives

The authoritative inventory is the Markdown table in **`docs/05_cookie-consent-specification.md` §5**. It lists every cookie, `localStorage` key, and `IndexedDB` store that the app writes, with its category, purpose, and source SDK.

Keep the inventory in sync with the codebase — it is a legal document, not just a comment.

---

### How to discover what the app sets (audit)

Run a full audit whenever you add or upgrade a dependency that touches network, auth, analytics, or storage.

#### Step-by-step in Chrome DevTools

1. Open Chrome → a **fresh profile** (or Incognito + clear all site data first).
2. Navigate to the running app.
3. Open DevTools → **Application** tab.
4. Walk through every storage area and record what is present:

| DevTools panel | What to check |
| --- | --- |
| Application → Cookies → `localhost` | All `Set-Cookie` values and their names, domain, `HttpOnly`, `Secure`, `SameSite` flags |
| Application → Local Storage → `localhost` | Every key/value pair |
| Application → Session Storage → `localhost` | Every key/value pair |
| Application → IndexedDB | Every database name and object store |

5. Do the same **after consenting to analytics** to catch anything that only appears post-consent.
6. Compare every entry against the inventory in the spec.

#### What each storage type looks like for Firebase

| Pattern | Storage | Category |
| --- | --- | --- |
| `firebase:authUser:…` | Local Storage | Necessary |
| `firebase:host:…` | Local Storage | Necessary |
| `firebase-installations-database` | IndexedDB | Necessary |
| `firebase-heartbeat-database` | IndexedDB | Necessary |
| `firestore/…` | IndexedDB | Necessary |
| `_ga`, `_ga_*`, `_gid` | Cookie | Analytics (requires consent) |
| `cookie_consent_v1` | Local Storage | Necessary (our own) |

#### Automated scan (staging environment)

For a more thorough scan before production releases, run one of the following against the deployed staging URL:

- **[Cookiebot](https://www.cookiebot.com/)** — paste the URL, get a categorised report within minutes.
- **[CookieServe](https://www.cookieserve.com/)** — similar free scan.
- **[OneTrust Cookie Compliance](https://www.onetrust.com/)** — enterprise-grade, CI-integrable.

Save the scanner report PDF to `docs/audits/YYYY-MM-DD-cookie-scan.pdf` and note the date in the inventory.

---

### How to classify a new cookie or storage entry

When you find something in the audit that is not yet in the inventory, apply this decision tree:

```text
Is it required for the app to function at all without the user doing anything?
  Yes → Necessary (no consent required)
  No  → Is it used for product analytics / measuring usage?
          Yes → Analytics (consent required, default off)
          No  → Is it used for advertising, remarketing, or conversion tracking?
                  Yes → Marketing (consent required, default off)
                  No  → Unknown — investigate the SDK source before classifying
```

**When in doubt, default to the more restrictive category.** If you cannot determine the purpose of an entry, treat it as non-essential until proven otherwise.

---

### How to add a new entry to the inventory

Open `docs/05_cookie-consent-specification.md` and add a row to the appropriate table in §5.

Each row must have:

| Column | What to write |
| --- | --- |
| Name / Pattern | Exact key name, or a glob pattern if the key is dynamic (e.g. `firebase:authUser:*`) |
| Storage | `Cookie`, `localStorage`, `sessionStorage`, or `IndexedDB` |
| Purpose | One sentence: what the app would lose if this were absent |
| Source | Which SDK or code path writes it — e.g. `Firebase Auth`, `bk2 app`, `Google Analytics` |

Example row for a hypothetical Sentry error tracker:

```markdown
| `sentry-*` | localStorage | Sentry session replay and error grouping | Sentry SDK |
```

---

### Where category descriptions live in the UI

The **`CookieBanner`** component (`libs/consent/ui/src/lib/cookie-banner.ts`) contains the per-category names and descriptions rendered inside the "Anpassen" (Customize) section. They are currently hardcoded in the template:

```html
<!-- Necessary — always shown, toggle disabled -->
<ion-item>
  <ion-label>
    <h3>Notwendig</h3>
    <p>Authentifizierung, Sitzung, Sicherheit</p>
  </ion-label>
  <ion-toggle [checked]="true" [disabled]="true" slot="end" />
</ion-item>

<!-- Analytics — user-toggleable -->
<ion-item>
  <ion-label>
    <h3>Analyse</h3>
    <p>Firebase Analytics — hilft uns, die App zu verbessern</p>
  </ion-label>
  <ion-toggle [checked]="analyticsToggle()" ... />
</ion-item>
```

**If you add a new consent category**, add a matching `<ion-item>` block here alongside a new signal for the toggle (see "Adding a new consent category" above).

**Keep descriptions short and factual.** The GDPR requires that users can make an informed choice — vague descriptions like "personalisation" are not sufficient. State which vendor is involved and what data is collected.

---

### End-to-end workflow: adding a new SDK that sets cookies

Here is the complete checklist when you introduce a dependency (e.g. a customer chat widget, a maps SDK, an A/B testing tool) that sets cookies or storage:

- [ ] **Discover**: run the DevTools audit (above) against the app with the new SDK installed.
- [ ] **Classify**: apply the decision tree — necessary, analytics, or marketing?
- [ ] **If non-essential — gate it**: the SDK must not load until the user grants consent. Follow the `AnalyticsLoaderService` pattern: subscribe to `consent$` and dynamically `import()` the SDK only when the relevant category is `true`.
- [ ] **Add to inventory**: add a row to §5 of the spec with name, storage type, purpose, and source.
- [ ] **Add to UI**: if the SDK belongs to a new category, add the category toggle to `CookieBanner`. If it fits an existing category (e.g. another analytics tool), the existing toggle covers it — just update the description text to mention the new vendor.
- [ ] **Test**: verify in a clean browser that the SDK's cookies/storage do **not** appear before consent is granted, and **do** appear after accepting the relevant category.
- [ ] **Re-scan**: run an automated scanner against staging and save the report to `docs/audits/`.
- [ ] **PR checklist item**: add "Cookie inventory updated" to the PR description checklist.

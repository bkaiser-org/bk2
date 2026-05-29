# Cookie Consent Specification

**Project:** bk2 **Status:** Draft **Last updated:** 2026-05-25 **Stack:** Angular \+ Ionic \+ Firebase

---

## 1\. Overview

This specification defines the approach for cookie and storage consent management in the bk2 application. It covers categorization of cookies/storage, the consent UI banner, conditional initialization of third-party SDKs (notably Firebase Analytics), and ongoing compliance auditing.

The implementation must satisfy GDPR and ePrivacy Directive requirements: non-essential cookies and storage may only be set **after** explicit user consent.

---

## 2\. Goals and non-goals

### Goals

- Block all non-essential cookies, storage, and tracking SDKs until the user grants consent.  
- Present a clear, compliant cookie banner on first visit and persist the user's choice.  
- Allow users to review and change their consent at any time.  
- Keep essential application functionality (authentication, session, security) working without requiring consent.  
- Minimize bundle size impact by lazy-loading non-essential SDKs only after consent.

### Non-goals

- Runtime detection of arbitrary cookies (unreliable and legally insufficient — see §3).  
- Geo-targeting of the banner (banner is shown to all users; can be added later if needed).  
- Server-side consent storage (initial version stores consent locally; sync to backend is a future enhancement).

---

## 3\. Approach rationale

### Why not runtime cookie detection?

A naive approach would scan `document.cookie` at runtime and show a banner based on what is present. This is rejected because:

- Third-party SDKs (Firebase Analytics, Google Tag Manager, etc.) set cookies **as they load**. By the time detection runs, the cookies have already been set without consent — a GDPR violation.  
- `document.cookie` does not expose `HttpOnly` cookies, nor does it cover `localStorage`, `sessionStorage`, or `IndexedDB`, all of which Firebase uses extensively.  
- Compliance requires that consent be obtained **before** non-essential storage is written, not after.

### Chosen approach: categorize and gate

1. Maintain a manual inventory of cookies and storage used by the app (see §5).  
2. Categorize each entry as essential or non-essential.  
3. Only initialize non-essential SDKs and write non-essential storage **after** explicit consent.  
4. Re-audit the inventory periodically using automated tools (see §10).

---

## 4\. Consent categories

| Category | Description | Default | User-toggleable |
| :---- | :---- | :---- | :---- |
| Necessary | Required for core app function: authentication, session, security, CSRF protection. | Always on | No |
| Analytics | Usage analytics for product improvement (e.g. Firebase Analytics, GA). | Off | Yes |
| Marketing | Advertising, remarketing, conversion tracking. | Off | Yes |

The Necessary category cannot be disabled. Analytics and Marketing default to off and require explicit opt-in.

---

## 5\. Cookie and storage inventory

The following inventory must be maintained as the codebase evolves. Each entry should be reviewed quarterly.

### Essential (no consent required)

| Name / Pattern | Storage | Purpose | Source |
| :---- | :---- | :---- | :---- |
| `firebase:authUser:*` | localStorage | User authentication session | Firebase Auth |
| `firebase:host:*` | localStorage | Firebase host config | Firebase SDK |
| `firebase-installations-*` | IndexedDB | Installation ID for Firebase services | Firebase Installations |
| `firebase-heartbeat-*` | IndexedDB | SDK heartbeat for support | Firebase SDK |
| `firestore/*` | IndexedDB | Offline persistence (if enabled) | Firestore |
| `__session` | Cookie | Server session (if using Firebase Hosting SSR) | Firebase Hosting |
| `cookie_consent_v1` | localStorage | Stores the user's consent choice | bk2 app |

### Non-essential — Analytics (requires consent)

| Name / Pattern | Storage | Purpose | Source |
| :---- | :---- | :---- | :---- |
| `_ga` | Cookie | Google Analytics user identification | Firebase Analytics / GA |
| `_ga_*` | Cookie | GA4 session state | Firebase Analytics |
| `_gid` | Cookie | GA user identification (24h) | Google Analytics |

### Non-essential — Marketing (requires consent)

*(None at present. Add entries here if marketing/ad SDKs are introduced.)*

---

## 6\. Consent state model

interface ConsentState {

  necessary: boolean;   // always true

  analytics: boolean;

  marketing: boolean;

  decided: boolean;     // user has made an explicit choice

  timestamp?: number;   // when the choice was recorded (epoch ms)

}

**Persistence:** The consent state is stored in `localStorage` under the key `cookie_consent_v1`. The version suffix allows for schema migrations.

**Default state (no decision yet):**

{ "necessary": true, "analytics": false, "marketing": false, "decided": false }

When `decided` is `false`, the banner must be displayed.

---

## 7\. Architecture

The consent feature lives in a shared Nx library (`libs/consent/`) so all apps in the monorepo get the same implementation without duplication. The library has two layers:

| Layer | Import alias | Responsibility |
| :---- | :---- | :---- |
| `data-access` | `@bk2/consent-data-access` | `ConsentService`, `AnalyticsLoaderService` |
| `ui` | `@bk2/consent-ui` | `CookieBanner` component |

### 7.1 ConsentService (`libs/consent/data-access/src/lib/consent.service.ts`)

A singleton Angular service (`providedIn: 'root'`) that:

- Loads consent state from `localStorage` on construction.  
- Exposes the current state as an `Observable` (`consent$`) so consumers can react to changes.  
- Provides methods: `acceptAll()`, `rejectAll()`, `setCustom(partial)`, `reset()`.  
- Provides query helpers: `hasAnalyticsConsent()`, `hasMarketingConsent()`, `needsBanner()`, `getState()`.  
- Persists every change immediately to `localStorage` with a fresh `timestamp`.
- Guards all `localStorage` access with `isBrowser(platformId)` for SSR safety.

### 7.2 Firebase initialization (`src/app/app.config.ts`)

Essential Firebase modules are always initialized:

- `provideFirebaseApp(...)`  
- `provideAuth(...)`  
- `provideFirestore(...)`

Analytics is **not** provided in the static config. It is initialized dynamically by `AnalyticsLoaderService` only after consent is granted.

### 7.3 AnalyticsLoaderService (`libs/consent/data-access/src/lib/analytics-loader.service.ts`)

Subscribes to `ConsentService.consent$` and:

- When `analytics` becomes `true`: dynamically imports `firebase/analytics`, calls `getAnalytics()` and `setAnalyticsCollectionEnabled(analytics, true)`.  
- When `analytics` becomes `false` (consent withdrawn): calls `setAnalyticsCollectionEnabled(analytics, false)`.  
- Uses `isSupported()` to gracefully no-op on unsupported environments (Capacitor native, SSR, some browsers).

Dynamic `import('firebase/analytics')` keeps the analytics bundle out of the initial app bundle until needed.

### 7.4 CookieBanner (`libs/consent/ui/src/lib/cookie-banner.ts`)

A standalone Angular/Ionic component that:

- Is rendered globally from `bk-root.ts`.  
- Is visible only when `ConsentService.needsBanner()` is `true` (reactive via `toSignal(consent$)`).  
- Provides three primary actions: **Alle akzeptieren**, **Nur notwendige**, **Anpassen**.  
- The "Anpassen" (Customize) action expands an inline preferences section with per-category toggles.
- Equal visual weight on all action buttons (GDPR dark-pattern prohibition).

### 7.5 PreferencesModalComponent (future)

A full-screen modal with granular toggles per category, accessible from:

- The banner's "Customize" action.  
- A "Cookie settings" link in the app footer / settings page.

---

## 8\. UI and UX requirements

### 8.1 Banner

- **Visibility:** Fixed position, bottom of viewport, `z-index: 10000`. Does not block critical UI but is unmistakable.  
- **Content:** Brief explanation of what cookies are used for, link to privacy policy, three actions.  
- **Equal weight:** The "Reject non-essential" button must be visually equivalent to "Accept all" in size, color contrast, and prominence. Dark patterns (e.g. greyed-out reject, hidden in a sub-menu) are explicitly prohibited.  
- **No pre-ticked boxes:** Analytics and Marketing default to off.  
- **Dismissal:** The banner cannot be dismissed without making a choice (closing it without action does not count as consent).

### 8.2 Preferences modal

- Toggle per category (Necessary is shown but disabled).  
- Description of what each category enables and which vendors are involved.  
- **Save preferences** button persists the custom selection.

### 8.3 Re-consent

A "Cookie settings" link must be present in:

- The app footer or main settings page.  
- The privacy policy page.

Selecting it opens the preferences modal with the current state pre-loaded.

---

## 9\. Behavioural requirements

- On first visit (`decided === false`), the banner is shown after the app shell has rendered.  
- No non-essential SDK may execute, register, or write storage until the corresponding category in `ConsentState` is `true`.  
- Withdrawing consent must immediately disable the corresponding SDK (e.g. `setAnalyticsCollectionEnabled(false)`). Existing cookies/storage from that vendor should be cleared on a best-effort basis where possible.  
- Consent state changes propagate via the `consent$` observable; consumers must subscribe rather than read once.  
- The `cookie_consent_v1` localStorage key itself is classified as essential and may be written before any user decision.

---

## 10\. Compliance and auditing

### 10.1 Manual audit (per release)

Before each production release that changes dependencies or adds third-party SDKs:

1. Run the app in a clean browser profile.  
2. Inspect Application → Storage in DevTools: Cookies, Local Storage, Session Storage, IndexedDB.  
3. Cross-check every entry against the inventory in §5.  
4. Add any new entries to the inventory and classify them.  
5. If a non-essential entry is being set without consent, gate it before release.

### 10.2 Automated auditing

Use one or more of the following on the deployed staging environment:

- [Cookiebot scanner](https://www.cookiebot.com/)  
- [OneTrust Cookie Compliance](https://www.onetrust.com/)  
- [CookieServe](https://www.cookieserve.com/)

Reports should be archived in the project documentation directory.

### 10.3 Records

- The `timestamp` field on `ConsentState` provides a per-user record of when consent was given.  
- For stronger audit trails, sync consent records to a backend collection (future enhancement; out of scope for this version).

---

## 11\. Edge cases

- **SSR (Angular Universal):** `localStorage` is not available. The service must guard reads/writes with `typeof window !== 'undefined'` checks and default to `decided: false` on the server.  
- **Capacitor / native builds:** `isSupported()` from `firebase/analytics` returns `false` on native; analytics simply does not initialize. No banner change required, but the categories should not be hidden — users may still toggle them for the web build accessed via the same account.  
- **Firebase Auth persistence:** Auth uses `localStorage` (or IndexedDB) keys that are essential. These must not be gated by consent — otherwise users cannot stay logged in.  
- **Firestore offline persistence:** If `enableIndexedDbPersistence()` is used, the resulting IndexedDB store is essential.  
- **Schema migration:** If `ConsentState` changes, bump the storage key suffix (`cookie_consent_v2`, …) and migrate or discard the old value.

---

## 12\. Future enhancements

- Granular preferences modal (§7.5).  
- Sync consent records to a Firestore collection for audit purposes.  
- Integration with [Google Consent Mode v2](https://developers.google.com/tag-platform/security/guides/consent) — required if Google Ads, GTM, or remarketing are introduced and the app serves EEA traffic.  
- Geo-aware banner behaviour (e.g. opt-out for non-EEA users where local law permits).  
- Re-prompt after a configurable interval (e.g. 12 months) to refresh consent.

---

## 13\. Acceptance criteria

- [ ] `ConsentService` exists and persists state to `localStorage` under `cookie_consent_v1`.  
- [ ] On first load with no stored consent, the banner is displayed.  
- [ ] Firebase Analytics is not loaded or initialized until the user opts into Analytics.  
- [ ] Withdrawing Analytics consent calls `setAnalyticsCollectionEnabled(false)` immediately.  
- [ ] "Reject non-essential" is visually equivalent to "Accept all".  
- [ ] A "Cookie settings" link is reachable from the footer or settings page and allows reopening the preferences UI.  
- [ ] The cookie/storage inventory (§5) is up to date and matches what the app sets at runtime.  
- [ ] SSR and Capacitor builds do not throw when `localStorage` or `window` is unavailable.

---

## 14\. References

- [GDPR Article 7 — Conditions for consent](https://gdpr-info.eu/art-7-gdpr/)  
- [ePrivacy Directive (2002/58/EC)](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32002L0058)  
- [CNIL guidelines on cookies and trackers](https://www.cnil.fr/en/cookies-and-other-tracking-devices)  
- [Google Consent Mode v2](https://developers.google.com/tag-platform/security/guides/consent)  
- [Firebase Analytics: `setAnalyticsCollectionEnabled`](https://firebase.google.com/docs/reference/js/analytics#setanalyticscollectionenabled)


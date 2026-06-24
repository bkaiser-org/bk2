---
name: website
description: Use when editing, deploying, or debugging the static marketing website (scs-website) served at /web — or its fonts, CSP/CORS headers, or caching. Covers the embedded-static-site pattern, self-hosting fonts, OFL licensing, the immutable-CSS cache-bust trap, the service-worker connect-src CSP gotcha, and what a deploy actually requires (no version bump).
---

# Static Marketing Website (`/web`)

The public marketing site lives in `apps/scs-website/` — hand-authored static HTML + `assets/` (CSS, JS, images, fonts). It is **not an Angular app** and **not its own Firebase hosting site**.

## How it ships (the embedded-static pattern)

`scs-website` is **copied into the main app** at build time and served under `/web` of site `scs-app-54aef`:

- Asset rule in [apps/scs-app/project.json](../../../apps/scs-app/project.json): `{ "glob": "**/*", "input": "apps/scs-website", "output": "./web" }` → everything lands in `dist/apps/scs-app/browser/web/`.
- Clean-URL + API rewrites are in [firebase.json](../../../firebase.json) under the `scs-app-54aef` hosting block: `/web/news` → `/web/news.html`, `/web/api/**` → the `publicApi` Cloud Function, `/web` → `/web/index.html`.
- **Not in the service worker.** [ngsw-config.json](../../../apps/scs-app/ngsw-config.json) only caches `/index.html`, `/*.css`, `/*.js`, `/assets/**` — **not** `/web/**` — and `navigationUrls` explicitly excludes `!/web/**`. So `/web` pages are plain static files served directly by hosting, bypassing ngsw nav and asset caching.

### Other websites (separate sites, NOT this pattern)
`okr-website`, `kring-website`, `p13-website` are their **own** hosting sites (`dist/apps/<name>`, own CSP, own `firebase deploy --only hosting:<site>`). They still load fonts from the Google CDN (not yet self-hosted). Don't confuse them with the embedded `/web` site.

## Deploying a change — is a release needed?

**No version bump, no service-worker release.** Because `/web` is not in the ngsw manifest, editing it does not change the Angular bundle or the SW hash, so it does **not** trigger the in-app update modal. There is no `RELEASE 6.4.x`-style commit needed.

**But it only reaches users via a hosting redeploy of scs-app:**
```sh
pnpm nx build scs-app --configuration production   # copies /web into dist
firebase deploy --only hosting:scs-app-54aef
```
See the **`firebase-deploy`** skill for the environment prerequisites (`set-env.js`) and site IDs.

## ⚠️ The immutable-CSS cache-bust trap

The `scs-app-54aef` headers in [firebase.json](../../../firebase.json) cache `**/*.@(js|css)` and images/fonts as `public, max-age=31536000, immutable` (1 year); only `**/*.html` is `max-age=0, must-revalidate`.

**Consequence:** when you edit `assets/styles.css` (or `shared.js`/`api.js`), repeat visitors keep the **old cached copy for up to a year** even though they get fresh HTML. New `.woff2` files are safe (new filenames), but a changed `styles.css` is not.

**Fix:** bump the cache-bust query on the `<link>`/`<script>` in **all** HTML pages so the fresh HTML points at a new URL:
```html
<link rel="stylesheet" href="assets/styles.css?v=2-selfhost-fonts" />
```
```sh
# bump across every page at once
perl -pi -e 's{styles\.css\?v=[^"]*}{styles.css?v=3-<reason>}g' apps/scs-website/*.html
```

## Fonts — self-hosted (no Google CDN)

The `/web` pages self-host their fonts under [apps/scs-website/assets/fonts/](../../../apps/scs-website/assets/fonts/) — **no `fonts.googleapis.com` / `fonts.gstatic.com`** (privacy/GDPR + avoids the CSP gotcha below). Current families:

| Family | Weights | Used for |
|---|---|---|
| Inter | 300/400/500/600/700 | body (`font-family: 'Inter'`) |
| Plus Jakarta Sans | 500/600/700/800 | `.font-display` headings |

`@font-face` rules live at the top of `assets/styles.css` (one per weight × subset, `font-display: swap`, proper `unicode-range`). Tailwind's `fontFamily` config (in [tailwind.config.js](../../../apps/scs-website/tailwind.config.js)) names the families; they resolve to the local `@font-face`. The main `scs-app` Angular shell itself uses only the **system font stack** (`-apple-system, …`) — no web fonts.

### Adding / updating a font
Download full-subset woff2 from the **Fontsource CDN** (`cdn.jsdelivr.net`, already CSP-allowed), `latin` + `latin-ext` for German:
```sh
cd apps/scs-website/assets/fonts
curl -fsSL -o inter-latin-400.woff2 \
  "https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-400-normal.woff2"
# URL pattern: .../fonts/<family>@latest/<subset>-<weight>-normal.woff2
file *.woff2   # each must report "Web Open Font Format (Version 2)"
```
Then add matching `@font-face` blocks to `styles.css` and **bump the `?v=` cache-bust** (see trap above). German needs `latin` (umlauts ä ö ü ß are in U+0000–00FF); add `latin-ext` for foreign names.

## Font licensing

Both bundled families are **SIL Open Font License 1.1 (OFL-1.1)** — free to self-host, bundle, and redistribute commercially. OFL obligations: don't sell the files alone, don't reuse the reserved names for *modified* fonts, and **keep the license notice with the files**. So each family's license ships alongside the woff2s:
- `assets/fonts/LICENSE-Inter.txt` — © The Inter Project Authors
- `assets/fonts/LICENSE-PlusJakartaSans.txt` — © The Plus Jakarta Sans Project Authors

When adding any new font, confirm it is OFL/Apache/permissive and drop its `LICENSE`/`OFL.txt` into `assets/fonts/`.

## Tailwind — precompiled (no Play CDN)

The pages style with Tailwind utility classes, but Tailwind is **precompiled to a static stylesheet**, not loaded from `cdn.tailwindcss.com` at runtime. The Play CDN was removed because the `ngsw` service worker re-fetches it under `connect-src` (see gotcha below) and it's a Tailwind-discouraged production dependency.

- Config: [apps/scs-website/tailwind.config.js](../../../apps/scs-website/tailwind.config.js) (v3; `content: ['apps/scs-website/**/*.html']`, `darkMode: 'media'`, custom `scs` colors + `fontFamily`).
- Input: `apps/scs-website/tailwind.input.css` (`@tailwind base/components/utilities`).
- Output: `apps/scs-website/assets/tailwind.css` (**committed**, minified, ~27 KB), linked in every page **before** `styles.css`.
- Both build-only files are excluded from the `/web` copy via the asset `ignore` in [apps/scs-app/project.json](../../../apps/scs-app/project.json).

**⚠️ The CSS is precompiled, so adding a Tailwind class to the HTML does nothing until you regenerate:**
```sh
pnpm run build:web-css      # regenerates assets/tailwind.css from the HTML
```
Then **bump the `?v=`** on the `tailwind.css` link (same immutable-cache trap as `styles.css`) and rebuild/redeploy scs-app. `tailwindcss@^3.4` is a dev dependency.

## CSP / CORS

Each hosting site has its **own** Content-Security-Policy in the `headers` block of [firebase.json](../../../firebase.json) (there is no global CSP). For the `/web` pages it's the `scs-app-54aef` site's `**` CSP.

Relevant directives for static pages:
- `font-src 'self' data: …` / `style-src 'self' 'unsafe-inline' …` — self-hosted (same-origin) fonts + the precompiled `tailwind.css` need only `'self'`. There is intentionally **no `cdn.tailwindcss.com`** anymore (Tailwind is precompiled).
- `connect-src 'self' … https://cdn.jsdelivr.net …` — `fetch()`/XHR destinations (and SW-proxied requests — see gotcha).

### Service-worker `connect-src` gotcha
**Any** resource fetched by **`ngsw-worker.js`** (the app's service worker, whose scope covers `/web`) goes through `fetch()` and is governed by **`connect-src`, not `font-src`/`script-src`/`img-src`**. This is why external resources used only via `<link>`/`<script>`/`@font-face` (Google Fonts, the Tailwind Play CDN) got blocked by `connect-src` despite being allowed in their own directive — and ngsw then returns a **synthetic 504** for the failed fetch (not a real timeout). Self-hosting / precompiling (same-origin) sidesteps it via `connect-src 'self'`.

**Adding a new external host:** add it to the **per-site `connect-src`** (every site that needs it), not just the resource-type directive. It fails only at runtime in prod, never locally. See the project memory note *"CSP connect-src for external services"*.

### publicApi (the `/web/api` data source)
The pages fetch club content via [api.js](../../../apps/scs-website/assets/api.js) → the **`publicApi`** Cloud Function (`apps/functions/src/publicApi/`); on any failure they fall back to inline `SCS_FALLBACK` data, so content still renders. `publicApi` has its **own** CORS allowlist in [publicApi/index.ts](../../../apps/functions/src/publicApi/index.ts) (`DEFAULT_ALLOWED_ORIGINS`) — **separate** from `main.ts`'s list. A production custom domain not in it gets a 200 response with **no `Access-Control-Allow-Origin`**, so the browser discards it (CORS error). Fix = add the domain to `DEFAULT_ALLOWED_ORIGINS` (or the `PUBLIC_API_ALLOWED_ORIGINS` env var) and **redeploy the function** (`firebase deploy --only functions:publicApi`, after the build+prune in the `firebase-deploy` skill). A `/web/api/**` → `publicApi` hosting rewrite exists for same-origin calls, but api.js currently calls the function's absolute URL. CORS allow-lists for Storage are separate (`cors.json`).

## Quick reference

| Task | Action |
|---|---|
| Edit a page | `apps/scs-website/*.html` (hand-authored) |
| Edit shared CSS | `apps/scs-website/assets/styles.css` → **bump `?v=`** |
| Ship a change | build scs-app prod + `firebase deploy --only hosting:scs-app-54aef` |
| Need a version bump? | **No** — `/web` isn't in the ngsw manifest |
| Add a font | Fontsource woff2 → `assets/fonts/` + `@font-face` + license file + bump `?v=` |
| Change Tailwind classes | edit HTML → `pnpm run build:web-css` → bump `tailwind.css` `?v=` |
| Allow a new external host | add to per-site `connect-src` in `firebase.json` (SW fetch = connect-src) |
| API call CORS-blocked | add the origin to `DEFAULT_ALLOWED_ORIGINS` in `publicApi/index.ts` + redeploy `publicApi` |

## Common mistakes

- **Editing `styles.css`/`tailwind.css` without bumping `?v=`** → repeat visitors get stale CSS for up to a year (immutable cache).
- **Adding/using a Tailwind class without `pnpm run build:web-css`** → it's precompiled; the class won't exist in `tailwind.css` until you regenerate.
- **Adding a font/script to `font-src`/`script-src` but the SW still blocks it (504)** → it's a `connect-src` request when fetched by `ngsw-worker.js`. Self-host/precompile or add to `connect-src`.
- **Expecting a `/web` change to trigger the update modal** → it won't; `/web` is outside the service worker. You still must redeploy hosting.
- **Bundling a font without its license** → OFL requires the notice ship alongside the files.
- **Re-adding `fonts.gstatic.com`/`fonts.googleapis.com`/`cdn.tailwindcss.com`** → fonts and Tailwind are self-hosted/precompiled on purpose; don't reintroduce the CDN dependencies.
- **Adding an API origin to `main.ts` only** → `publicApi` uses its **own** allowlist in `publicApi/index.ts`. Update that one.

# kring-website

Marketing website for **Kring**, the commercial SaaS product of bkaiser GmbH.
A set of hand-written, dependency-free HTML pages: one landing page plus five
audience-specific pages (Vereine, Alumni, Stockwerkeigentum, Genossenschaften,
KMU).

Kring is built on the open-source project **openkring** — that relationship is
shown in the co-branding footer of every page. The openkring project site lives
separately in `apps/okr-website`.

## Structure

```
kring-website/
├── index.html      # main landing page
├── club.html       # Vereine
├── alumni.html     # Alumni / Jahrgänge
├── steg.html       # Stockwerkeigentum
├── coop.html       # Genossenschaften & Co.
├── kmu.html        # KMU
├── assets/         # Kring SVG logo assets + brand styleguide
├── api/            # placeholder for future API examples
└── project.json    # Nx targets: serve, build, deploy
```

Each page is self-contained: the CSS lives in an inline `<style>` block and the
markup has no build step. Branding follows `assets/brand-styleguide.html` — the
header uses the inline Kring wordmark, the favicon is `assets/kring-favicon.svg`,
and the footer carries the `Kring · basierend auf openkring` co-branding.

## Local development

```sh
pnpm nx serve kring-website
```

Serves the site at <http://localhost:4200> directly from source — no build step.
Clean URLs are enabled, so `/club` resolves to `club.html`.

## Build

```sh
pnpm nx build kring-website
```

Copies the HTML pages and `assets/` into `dist/apps/kring-website`.

## Deployment (Firebase Hosting)

The site deploys to the Firebase Hosting site `kring-website-54aef` in the
`bkaiser-org` project.

First time only — create the hosting site:

```sh
firebase hosting:sites:create kring-website-54aef
```

Then build and deploy:

```sh
pnpm nx deploy kring-website
# equivalent to:
#   pnpm nx build kring-website
#   firebase deploy --only hosting:kring-website-54aef
```

Hosting configuration (clean URLs, cache headers, Content-Security-Policy) lives
in the root `firebase.json`.

## License

[MIT](./LICENSE) © 2026 bkaiser GmbH

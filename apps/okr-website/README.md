# okr-website

Static marketing website for **Kring** / the **openkring** open-source project.
A set of hand-written, dependency-free HTML pages: one landing page plus five
audience-specific pages.

## Structure

```
okr-website/
├── index.html      # main landing page
├── club.html       # Vereine
├── alumni.html     # Alumni / Jahrgänge
├── steg.html       # Stockwerkeigentum
├── coop.html       # Genossenschaften & Co.
├── kmu.html        # KMU
├── assets/         # openkring SVG logo assets + brand styleguide
├── api/            # placeholder for future API examples
└── project.json    # Nx targets: serve, build, deploy
```

Each page is self-contained: the CSS lives in an inline `<style>` block and the
markup has no build step. Branding follows `assets/openkring-styleguide.html` —
the header uses the inline `openkring` wordmark and the favicon is
`assets/openkring-favicon.svg`.

## Local development

```sh
pnpm nx serve okr-website
```

Serves the site at <http://localhost:4200> directly from source — no build step.
Clean URLs are enabled, so `/club` resolves to `club.html`.

## Build

```sh
pnpm nx build okr-website
```

Copies the HTML pages and `assets/` into `dist/apps/okr-website`.

## Deployment (Firebase Hosting)

The site deploys to the Firebase Hosting site `okr-website-54aef` in the
`bkaiser-org` project.

First time only — create the hosting site:

```sh
firebase hosting:sites:create okr-website-54aef
```

Then build and deploy:

```sh
pnpm nx deploy okr-website
# equivalent to:
#   pnpm nx build okr-website
#   firebase deploy --only hosting:okr-website-54aef
```

Hosting configuration (clean URLs, cache headers, Content-Security-Policy) lives
in the root `firebase.json`.

## License

[MIT](./LICENSE) © 2026 bkaiser GmbH

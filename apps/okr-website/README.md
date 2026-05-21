# okr-website

Website for **openkring** — the open-source project behind the community
platform Kring. A set of hand-written, dependency-free HTML pages that explain
the project's purpose, technical architecture, license, how to contribute, and
the ecosystem around it.

The Kring *product* marketing site lives separately in `apps/kring-website`.

## Structure

```
okr-website/
├── index.html         # Zweck — what openkring is, the philosophy, overview
├── architektur.html   # Technische Architektur — stack, monorepo, data, integrations
├── mitwirken.html     # Mitwirken — get the code, dev setup, contribution workflow
├── lizenz.html        # Lizenz — the MIT license and brand notes
├── oekosystem.html    # Ökosystem — openkring, Kring and bkaiser GmbH
├── assets/            # openkring SVG logo assets
├── api/               # placeholder for future API examples
└── project.json       # Nx targets: serve, build, deploy
```

Each page is self-contained: the CSS lives in an inline `<style>` block and the
markup has no build step. Styling follows the shared brand styleguide
(`apps/kring-website/assets/brand-styleguide.html`) — the header uses the inline
openkring wordmark, the favicon is `assets/openkring-favicon.svg`, and the footer
carries the `Kring · basierend auf openkring` co-branding.

Content is synthesised from the project documentation (`CLAUDE.md`, `APPARCH.md`,
`AUTH.md`, `BEXIO.md`, the Matrix/FCM/invoice guides) and the brand styleguide.

> **TODO:** the contributing links point to the placeholder repository URL
> `https://github.com/bkaiser-org/openkring` — replace with the real URL once the
> repository is public.

## Local development

```sh
pnpm nx serve okr-website
```

Serves the site at <http://localhost:4200> directly from source — no build step.
Clean URLs are enabled, so `/architektur` resolves to `architektur.html`.

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

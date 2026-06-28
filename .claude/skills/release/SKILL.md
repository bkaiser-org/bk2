---
name: release
description: Use when cutting a release — shipping/publishing/deploying a new version of an app to Firebase Hosting, or deploying Cloud Functions or Firestore/Storage rules. Covers running the release script, the app-version update prompt, and troubleshooting a failed release.
---

# Release

The release runbook is a **script**, not a manual procedure: [scripts/release.mjs](../../../scripts/release.mjs), run via `pnpm release`. It is the deterministic spine (preflight → test → bump → build → deploy → tag → push) with interactive confirmation gates. This skill covers *driving* it and the judgment the script can't encode. Deploy mechanics live in the **`firebase-deploy`** skill.

Firebase project: `bkaiser-org`. Production app = `scs-app` (only its users see the in-app update prompt).

## Run it

```sh
pnpm release            # interactive target picker
pnpm release scs-app    # release one app (any of the apps below, or `all`)
pnpm release functions  # deploy Cloud Functions (all, or a prompted subset)
pnpm release rules      # deploy firestore + storage rules
```

Apps → hosting sites: `scs-app`→`scs-app-54aef`, `test-app`→`test-app-54aef`, `okr-website`→`okr-website-54aef`, `kring-website`→`kring-website-54aef`, `p13-website`→`p13-website-54aef`.

## What the app-release branch does (and where you decide)

1. **Test gate** — `pnpm run testlibs`; aborts the release on failure (before any bump).
2. **Version bump** — proposes a **patch** bump (offer minor/major); **you confirm**. Written to root `package.json` only (the single source of truth the app imports).
3. **Prod build** — sources `apps/<app>/.env` then `pnpm nx build <app> --configuration production`. The bump auto-invalidates the nx `config`+`build` cache (version is a runtime input), so the bundle carries the new version.
4. **Sentry source maps** — runs `scripts/sentry-sourcemaps.mjs <app>` **before** deploy (it injects debug IDs into the built JS, uploads maps, finalizes the `scs@<version>` release). Runs only if `SENTRY_AUTH_TOKEN`/`SENTRY_ORG`/`SENTRY_PROJECT` are exported; otherwise it warns (and, for `scs-app`, asks before deploying without maps). Export those vars before releasing the prod app.
5. **Deploy** — `firebase deploy --only hosting:<site>`; **you confirm** the site.
6. **app-version doc** — **asks each release** (default yes only for `scs-app`). It does **not** write Firestore; it **prints** the `latestVersion` (and optional `minVersion`) to apply to doc `app-version/app-version` via the console, the Firebase MCP `firestore_update_document` tool, or firebase-admin. `minVersion` defaults to unchanged; raise it only to force-update older clients.
7. **Commit + tag + push** — `release: v<version>` commit, annotated `v<version>` tag, `git push origin main --follow-tags`; **you confirm** the push.

If build or deploy fails, the script **reverts the version bump** so the tree stays clean.

Functions and rules branches do **no** version bump, **no** app-version update, and **no** tag.

## Apply the app-version value (step 5)

When the script prints the value, update Firestore doc `app-version/app-version` (default database), fields `{ latestVersion, minVersion, forceUpdate? }` — see [version-check.service.ts](../../../libs/shared/util-angular/src/lib/version-check.service.ts). Setting `latestVersion` is what surfaces the "update available" prompt (delivered via the service worker's `VERSION_READY`).

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Build fails reading `FIREBASE_WEBAPP_CONFIG` | `apps/<app>/.env` missing or not sourced. The script sources it; if running the build by hand, `source ./apps/<app>/.env` first. |
| Deployed but users never get the update prompt | `app-version.latestVersion` not updated, or the bump happened *after* the build (stale bundle version). The script orders it correctly — apply the printed value. |
| `pnpm-lock` / `overrides` mismatch deploying functions | Never raw `firebase deploy --only functions`; the script uses the build+pin+prune wrapper. See `firebase-deploy`. |
| Release aborted, `package.json` left bumped | Only happens if you Ctrl-C between bump and build; revert with `git checkout -- package.json`. |
| Wrong Firebase project | `firebase use bkaiser-org` before releasing. |

## Editing the process

Change the steps in [scripts/release.mjs](../../../scripts/release.mjs) (the spine) — keep the `SITES` map in sync with `firebase.json`. The functions branch delegates to [scripts/deploy-functions.mjs](../../../scripts/deploy-functions.mjs), which owns the buildpack pnpm pin + canary (see `firebase-deploy`). Update this skill only for the *driving* notes and troubleshooting.

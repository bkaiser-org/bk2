# Idea: Office Integration

**Date:** 2026-06-17
**Status:** Idea — stub, to be elaborated
**Origin:** New. Extends the deferred "direct Gmail API / Outlook Graph install" item in the [Email Signature spec](../done/2026-06-16-spec-email-signature.md) (§9).

## Problem / goal

Integrate with office suites (Google Workspace / Microsoft 365) so the app can connect to mail,
calendar and document storage — removing manual copy/paste and enabling 2-way sync.

> Scope note: original request was truncated ("office integration (only …"); the exact boundary
> (mail only? calendar? Drive/OneDrive docs?) is to be confirmed during elaboration.

## Initial scope (to refine — candidate areas)

- Mail: install email signature directly; optionally send via the user's account.
- Calendar: push/pull `calevent` ↔ Google/Outlook calendar.
- Documents: store/read generated PDFs in Drive / OneDrive / SharePoint.

## Open questions

- Which suite(s) first; OAuth scopes and consent; per-tenant app registration.
- Sync direction and conflict handling.

## Dependencies

- Email signature (shipped); document generation; OAuth/secrets via Cloud Functions.

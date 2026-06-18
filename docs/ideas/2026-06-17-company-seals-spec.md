# Idea: Company Seals (DeepSign)

**Date:** 2026-06-17
**Status:** Idea — stub, to be elaborated
**Origin:** Deferred from [DeepSign E-Signature spec](../done/2026-05-25-deepsign-integration-spec.md) (§1, v1 out of scope).

## Problem / goal

Allow applying an organisation **seal** (Firmensiegel) to a signed PDF in addition to personal
signatures, for documents that legally or conventionally require a company stamp.

## Initial scope (to refine)

- Seal asset stored per tenant/org (image + metadata).
- Placement via embedded Text Field Pattern, like personal signatures.
- Authorization: who may apply the org seal (privileged / memberAdmin).

## Open questions

- Is a seal a DeepSign primitive, or an image overlay we render before sending to DeepSign?
- Legal validity requirements per canton/use case?

## Dependencies

- DeepSign integration (shipped). Reuses the existing signing pipeline.

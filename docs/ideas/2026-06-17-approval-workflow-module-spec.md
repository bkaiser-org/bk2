# Idea: Approval Workflow Module

**Date:** 2026-06-17
**Status:** Idea — stub, to be elaborated
**Origin:** Deferred from [Expense Feature spec](../done/2026-05-25-expense-feature-spezifikation.md) (§1.2, "Vier-Augen-Prinzip"). Also requested by the [Forms Builder](../done/2026-05-27-forms-builder-spec.md) (P5) and [Application Feature](../done/2026-05-27-application-feature-spec.md).

## Problem / goal

A **reusable** approval step (single or multi-stage, four-eyes) that other features can attach to
before a state transition (expense → booking, application → acceptance, form submission → action).

## Initial scope (to refine)

- Generic approval entity: subject ref, approver(s), state, decision, comment, audit trail.
- Routing: who approves (responsibility / role).
- Notifications on pending/decided.
- Pluggable into expense, application, forms-builder.

## Open questions

- Sequential vs. parallel approvers? Delegation/escalation?
- Reuse the existing responsibility model for routing?

## Dependencies

- Notification mechanism (FCM / task). Consumed by Expense, Application, Forms Builder.

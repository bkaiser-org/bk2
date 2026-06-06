# AlertService Design

**Date:** 2026-05-15
**Scope:** `libs/shared/util-angular`

## Problem

`alert.util.ts` uses `t()` for i18n resolution — a function that is undefined everywhere. The file currently fails to compile with 12 type errors. The goal is to fix this by introducing signal-based translations via `I18nService.translateAll` where injection context is available, and removing all `t()` calls.

## Architecture

Two layers co-exist:

### Layer 1 — Plain util functions (`alert.util.ts`)

Kept for util-layer callers (`address.util.ts`, `download.util.ts`, `copy.util.ts`) that cannot inject services.

**Changes:**
- `error(toastController, message, isDebugMode?)` — remove `t()`, accept pre-resolved string
- `showToast(toastController, message)` — remove `t()`, accept pre-resolved string
- `confirm(alertController, message, okLabel, cancelLabel, isCancellable?, cssClass?)` — add `okLabel` and `cancelLabel` parameters, remove all `t()` calls
- `bkPrompt(alertController, header, placeholder, okLabel, cancelLabel, value?)` — add `okLabel` and `cancelLabel` parameters, remove all `t()` calls

No util-layer callers use `confirm` or `bkPrompt`, so adding parameters to those functions is safe.

### Layer 2 — `AlertService` (`alert.service.ts`, new)

For service/store/component callers that have an injection context.

```typescript
@Injectable({ providedIn: 'root' })
export class AlertService {
  private readonly alertController = inject(AlertController);
  private readonly toastController = inject(ToastController);
  private readonly i18n = inject(I18nService).translateAll({
    ok:     '@ok',
    cancel: '@cancel',
  });

  confirm(message: string, isCancellable = false, cssClass?: string): Promise<boolean>
  bkPrompt(header: string, placeholder: string, value?: string): Promise<string | undefined>
  showToast(message: string): Promise<void>
  error(message: string, isDebugMode?: boolean): undefined
}
```

Each method delegates to the corresponding plain util function, passing injected controllers and resolved `this.i18n.ok()` / `this.i18n.cancel()` labels.

## Caller Migration

### Util-layer callers — no change to call sites
`address.util.ts`, `download.util.ts`, `copy.util.ts` keep calling plain functions with `toastController`. Messages they pass are already plain strings (not `@keys`), so no translation change needed.

### Service/store/component callers — inject AlertService

Callers currently passing raw `@keys` as the message add that key to their own `translateAll` and call the signal at the call site:

| File | Key to add to their translateAll |
|------|----------------------------------|
| `matrix-chat.store.ts` | `@chat.operation.message.delete.confirm` |
| `auth.service.ts` | `@content.menuItem.action.logout.confirm` |
| `folder.store.ts` | `@folder.operation.delete.confirm` |
| `person.store.ts` | `@subject.person.operation.create.exists.error` |

Callers already passing resolved signal values (`store.i18n.x()`) only need to switch from the plain function to `AlertService` and drop the `alertController` / `toastController` parameter.

Full list of callers to migrate:

| File | Functions used |
|------|----------------|
| `auth.service.ts` | `confirm`, `showToast` |
| `auth/confirm-password-reset.page.ts` | `showToast` |
| `category-list.component.ts` | `error` |
| `matrix-chat.store.ts` | `confirm`, `bkPrompt`, `showToast` |
| `matrix-chat.ts` | `showToast` |
| `comment-list.store.ts` | `bkPrompt` |
| `folder.store.ts` | `confirm` |
| `folder-list.component.ts` | `error` |
| `group-list.component.ts` | `error` |
| `group.store.ts` | `confirm` |
| `person-list.ts` | `error` |
| `person.store.ts` | `confirm` |
| `org-list.component.ts` | `error` |
| `org.store.ts` | `confirm` |
| `addresses.store.ts` | `confirm` |
| `addresses-list.ts` | `error` |
| `geocode.service.ts` | `error` |
| `location-list.component.ts` | `error` |
| `location-list.store.ts` | `showToast` |

## Exports

`alert.service.ts` is exported from `libs/shared/util-angular/src/index.ts` alongside the existing plain functions.

## Testing

- `alert.util.spec.ts` — update to match new function signatures (`okLabel`, `cancelLabel` params); drop all mocks of `t()`
- `alert.service.spec.ts` (new) — unit tests for `AlertService` using `TestBed`, mocking `I18nService`, `AlertController`, and `ToastController`

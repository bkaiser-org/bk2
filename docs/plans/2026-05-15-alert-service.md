# AlertService Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the broken `t()` calls in `alert.util.ts` with a properly implemented translation helper, add `okLabel`/`cancelLabel` parameters to `confirm`/`bkPrompt`, and create `AlertService` as a signal-based DI facade over all four alert functions.

**Architecture:** `alert.util.ts` grows a module-level `TranslocoService` reference (initialized by `AlertService` on first injection) that powers the existing `t()` helper for util-layer callers. `confirm` and `bkPrompt` receive resolved `okLabel`/`cancelLabel` parameters and drop their own `t()` calls. `AlertService` is an `@Injectable({ providedIn: 'root' })` that injects `AlertController`, `ToastController`, and `I18nService`, resolves ok/cancel labels via `translateAll`, and delegates to the plain functions. All service/store/component callers are migrated to inject `AlertService` and pre-resolve their message keys via their own `translateAll`.

**Tech Stack:** Angular 20 signals, NgRx Signal Store, `@jsverse/transloco`, Ionic `AlertController`/`ToastController`, Vitest.

---

## File Map

| Action | File | Change |
|--------|------|--------|
| Modify | `libs/shared/util-angular/src/lib/alert.util.ts` | Add `initAlertTranslation`, implement `t()`, add `okLabel`/`cancelLabel` params |
| Modify | `libs/shared/util-angular/src/lib/alert.util.spec.ts` | Fix mocks, update signatures |
| Create | `libs/shared/util-angular/src/lib/alert.service.ts` | New injectable facade |
| Create | `libs/shared/util-angular/src/lib/alert.service.spec.ts` | Unit tests for service |
| Modify | `libs/shared/util-angular/src/index.ts` | Export `AlertService` |
| Modify | `libs/auth/data-access/src/lib/auth.service.ts` | Inject AlertService, translateAll for its keys |
| Modify | `libs/auth/feature/src/lib/confirm-password-reset.page.ts` | Inject AlertService |
| Modify | `libs/folder/feature/src/lib/folder.store.ts` | Inject AlertService, add delete_confirm to translateAll |
| Modify | `libs/comment/feature/src/lib/comment-list.store.ts` | Inject AlertService, add bkPrompt keys to translateAll |
| Modify | `libs/subject/group/feature/src/lib/group.store.ts` | Inject AlertService (alertController stays for direct use) |
| Modify | `libs/subject/org/feature/src/lib/org.store.ts` | Inject AlertService, add delete_confirm key |
| Modify | `libs/subject/person/feature/src/lib/person.store.ts` | Inject AlertService, add create_exists_error key |
| Modify | `libs/subject/address/feature/src/lib/addresses.store.ts` | Inject AlertService |
| Modify | `libs/geo/location/feature/src/lib/location-list.store.ts` | Inject AlertService, add copy_conf key |
| Modify | `libs/chat/feature/src/lib/matrix-chat.store.ts` | Inject AlertService + I18nService, translateAll for all keys |
| Modify | `libs/chat/feature/src/lib/matrix-chat.ts` | Inject AlertService, remove toastController |
| Modify | `libs/subject/address/data-access/src/lib/geocode.service.ts` | Inject AlertService |
| Modify | `libs/category/feature/src/lib/category-list.component.ts` | Inject AlertService |
| Modify | `libs/folder/feature/src/lib/folder-list.component.ts` | Inject AlertService |
| Modify | `libs/subject/group/feature/src/lib/group-list.component.ts` | Inject AlertService |
| Modify | `libs/subject/person/feature/src/lib/person-list.ts` | Inject AlertService |
| Modify | `libs/subject/org/feature/src/lib/org-list.component.ts` | Inject AlertService |
| Modify | `libs/subject/address/feature/src/lib/addresses-list.ts` | Inject AlertService |
| Modify | `libs/geo/location/feature/src/lib/location-list.component.ts` | Inject AlertService |

---

### Task 1: Fix `alert.util.ts`

**Files:**
- Modify: `libs/shared/util-angular/src/lib/alert.util.ts`

- [ ] **Step 1: Replace the entire file content**

```typescript
import { TranslocoService } from '@jsverse/transloco';
import { AlertController, AlertOptions, ToastController } from '@ionic/angular';
import { TOAST_LENGTH } from '@bk2/shared-constants';

let _translocoService: TranslocoService | null = null;

export function initAlertTranslation(service: TranslocoService): void {
  _translocoService = service;
}

function t(key: string | null | undefined): string {
  if (!key) return '';
  if (!key.startsWith('@')) return key;
  if (!_translocoService) return key;
  return _translocoService.translate(key.substring(1));
}

export function error(toastController: ToastController | undefined, message: string, isDebugMode = false): undefined {
  if (isDebugMode === true) {
    console.error(t(message));
  }
  if (toastController) {
    showToast(toastController, message);
  }
  return undefined;
}

export async function showToast(toastController: ToastController, message: string): Promise<void> {
  const _toast = await toastController.create({
    message: t(message),
    duration: TOAST_LENGTH
  });
  _toast.present();
}

export async function confirm(
  alertController: AlertController,
  message: string,
  okLabel: string,
  cancelLabel: string,
  isCancellable = false,
  cssClass?: string
): Promise<boolean> {
  const alertConfig: AlertOptions = isCancellable === false ? {
    message,
    buttons: [okLabel]
  } : {
    message,
    buttons: [
      { text: cancelLabel, role: 'cancel' },
      { text: okLabel, role: 'confirm' }
    ]
  };
  if (cssClass) {
    alertConfig['cssClass'] = cssClass;
  }
  const alert = await alertController.create(alertConfig);
  await alert.present();
  const { role } = await alert.onWillDismiss();
  return role === 'confirm';
}

export type PromptInputType = 'text' | 'number' | 'password';

export async function bkPrompt(
  alertController: AlertController,
  header: string,
  placeholder: string,
  okLabel: string,
  cancelLabel: string,
  value?: string
): Promise<string | undefined> {
  const alert = await alertController.create({
    header,
    cssClass: 'bk-prompt-alert',
    buttons: [
      { text: cancelLabel, role: 'cancel' },
      { text: okLabel, role: 'confirm' }
    ],
    inputs: [{ type: 'textarea', placeholder, value }]
  });
  await alert.present();
  const { data, role } = await alert.onWillDismiss();
  if (data?.values?.length === 0) return undefined;
  if (role === 'confirm') return data?.values[0] as string;
  return undefined;
}
```

- [ ] **Step 2: Verify compile**

```bash
npx tsc --noEmit -p libs/shared/util-angular/tsconfig.json 2>&1 | grep "alert.util"
```

Expected: no errors for `alert.util.ts` (other files will error until they are migrated).

---

### Task 2: Update `alert.util.spec.ts`

**Files:**
- Modify: `libs/shared/util-angular/src/lib/alert.util.spec.ts`

- [ ] **Step 1: Replace the entire file content**

```typescript
import { TranslocoService } from '@jsverse/transloco';
import { TOAST_LENGTH } from '@bk2/shared-constants';
import { AlertController, ToastController } from '@ionic/angular';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bkPrompt, confirm, error, initAlertTranslation, PromptInputType, showToast } from './alert.util';

vi.mock('@ionic/angular', () => ({
  AlertController: vi.fn(),
  ToastController: vi.fn()
}));

vi.mock('@bk2/shared-constants', () => ({
  TOAST_LENGTH: 3000
}));

describe('alert.util', () => {
  let mockAlertController: AlertController;
  let mockToastController: ToastController;
  let mockAlert: any;
  let mockToast: any;
  let mockTransloco: TranslocoService;

  beforeEach(() => {
    vi.clearAllMocks();

    mockTransloco = {
      translate: vi.fn((key: string) => `[${key}]`)
    } as any;
    initAlertTranslation(mockTransloco);

    mockAlert = {
      present: vi.fn().mockResolvedValue(undefined),
      onWillDismiss: vi.fn().mockResolvedValue({ role: 'confirm', data: undefined })
    };
    mockToast = { present: vi.fn().mockResolvedValue(undefined) };
    mockAlertController = { create: vi.fn().mockResolvedValue(mockAlert) } as any;
    mockToastController = { create: vi.fn().mockResolvedValue(mockToast) } as any;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('PromptInputType', () => {
    it('should export correct input types', () => {
      const inputTypes: PromptInputType[] = ['text', 'number', 'password'];
      expect(inputTypes).toContain('text');
      expect(inputTypes).toContain('number');
      expect(inputTypes).toContain('password');
    });
  });

  describe('error', () => {
    beforeEach(() => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    it('should log translated message in debug mode', () => {
      error(undefined, '@error.general', true);
      expect(mockTransloco.translate).toHaveBeenCalledWith('error.general');
      expect(console.error).toHaveBeenCalledWith('[error.general]');
    });

    it('should not log when debug mode is false', () => {
      error(undefined, 'message', false);
      expect(console.error).not.toHaveBeenCalled();
    });

    it('should show toast when toastController is provided', () => {
      error(mockToastController, 'Error', false);
      expect(mockToastController.create).toHaveBeenCalled();
    });

    it('should return undefined', () => {
      expect(error(undefined, 'test', false)).toBeUndefined();
    });

    it('should pass plain strings through without translation', () => {
      error(undefined, 'plain text', true);
      expect(console.error).toHaveBeenCalledWith('plain text');
    });
  });

  describe('showToast', () => {
    it('should create toast with translated @key message', async () => {
      await showToast(mockToastController, '@toast.success');
      expect(mockTransloco.translate).toHaveBeenCalledWith('toast.success');
      expect(mockToastController.create).toHaveBeenCalledWith({
        message: '[toast.success]',
        duration: TOAST_LENGTH
      });
      expect(mockToast.present).toHaveBeenCalled();
    });

    it('should pass plain string through without translating', async () => {
      await showToast(mockToastController, 'plain text');
      expect(mockToastController.create).toHaveBeenCalledWith({
        message: 'plain text',
        duration: TOAST_LENGTH
      });
    });

    it('should reject on controller failure', async () => {
      mockToastController.create = vi.fn().mockRejectedValue(new Error('fail'));
      await expect(showToast(mockToastController, 'test')).rejects.toThrow('fail');
    });
  });

  describe('confirm', () => {
    it('should create non-cancellable alert with provided okLabel', async () => {
      await confirm(mockAlertController, 'Are you sure?', 'OK', 'Cancel', false);
      expect(mockAlertController.create).toHaveBeenCalledWith({
        message: 'Are you sure?',
        buttons: ['OK']
      });
    });

    it('should create cancellable alert with both labels', async () => {
      await confirm(mockAlertController, 'Delete?', 'Yes', 'No', true);
      expect(mockAlertController.create).toHaveBeenCalledWith({
        message: 'Delete?',
        buttons: [
          { text: 'No', role: 'cancel' },
          { text: 'Yes', role: 'confirm' }
        ]
      });
    });

    it('should include cssClass when provided', async () => {
      await confirm(mockAlertController, 'msg', 'OK', 'Cancel', false, 'my-class');
      expect(mockAlertController.create).toHaveBeenCalledWith({
        message: 'msg',
        buttons: ['OK'],
        cssClass: 'my-class'
      });
    });

    it('should return true when dismissed with confirm role', async () => {
      mockAlert.onWillDismiss.mockResolvedValue({ role: 'confirm' });
      expect(await confirm(mockAlertController, 'msg', 'OK', 'Cancel', true)).toBe(true);
    });

    it('should return false when dismissed with cancel role', async () => {
      mockAlert.onWillDismiss.mockResolvedValue({ role: 'cancel' });
      expect(await confirm(mockAlertController, 'msg', 'OK', 'Cancel', true)).toBe(false);
    });

    it('should return false when role is undefined', async () => {
      mockAlert.onWillDismiss.mockResolvedValue({ role: undefined });
      expect(await confirm(mockAlertController, 'msg', 'OK', 'Cancel', true)).toBe(false);
    });

    it('should present the alert', async () => {
      await confirm(mockAlertController, 'test', 'OK', 'Cancel', false);
      expect(mockAlert.present).toHaveBeenCalled();
    });

    it('should reject on controller failure', async () => {
      mockAlertController.create = vi.fn().mockRejectedValue(new Error('fail'));
      await expect(confirm(mockAlertController, 'test', 'OK', 'Cancel', false)).rejects.toThrow('fail');
    });
  });

  describe('bkPrompt', () => {
    beforeEach(() => {
      mockAlert.onWillDismiss.mockResolvedValue({
        role: 'confirm',
        data: { values: ['user input'] }
      });
    });

    it('should create alert with header, okLabel, cancelLabel and textarea input', async () => {
      await bkPrompt(mockAlertController, 'Header', 'Placeholder', 'OK', 'Cancel');
      expect(mockAlertController.create).toHaveBeenCalledWith({
        header: 'Header',
        cssClass: 'bk-prompt-alert',
        buttons: [
          { text: 'Cancel', role: 'cancel' },
          { text: 'OK', role: 'confirm' }
        ],
        inputs: [{ type: 'textarea', placeholder: 'Placeholder', value: undefined }]
      });
    });

    it('should pass value when provided', async () => {
      await bkPrompt(mockAlertController, 'H', 'P', 'OK', 'Cancel', 'existing');
      const call = (mockAlertController.create as any).mock.calls[0][0];
      expect(call.inputs[0].value).toBe('existing');
    });

    it('should return user input when confirmed', async () => {
      expect(await bkPrompt(mockAlertController, 'H', 'P', 'OK', 'Cancel')).toBe('user input');
    });

    it('should return undefined when cancelled', async () => {
      mockAlert.onWillDismiss.mockResolvedValue({ role: 'cancel', data: { values: ['x'] } });
      expect(await bkPrompt(mockAlertController, 'H', 'P', 'OK', 'Cancel')).toBeUndefined();
    });

    it('should return undefined for empty values array', async () => {
      mockAlert.onWillDismiss.mockResolvedValue({ role: 'confirm', data: { values: [] } });
      expect(await bkPrompt(mockAlertController, 'H', 'P', 'OK', 'Cancel')).toBeUndefined();
    });
  });
});
```

- [ ] **Step 2: Run the tests**

```bash
pnpm run test shared-util-angular 2>&1 | tail -20
```

Expected: all `alert.util` tests pass.

- [ ] **Step 3: Commit**

```bash
git add libs/shared/util-angular/src/lib/alert.util.ts libs/shared/util-angular/src/lib/alert.util.spec.ts
git commit -m "fix(util-angular): fix t() in alert.util, add okLabel/cancelLabel params to confirm/bkPrompt"
```

---

### Task 3: Create `alert.service.ts` and its spec

**Files:**
- Create: `libs/shared/util-angular/src/lib/alert.service.ts`
- Create: `libs/shared/util-angular/src/lib/alert.service.spec.ts`

- [ ] **Step 1: Create `alert.service.ts`**

```typescript
import { inject, Injectable } from '@angular/core';
import { AlertController, ToastController } from '@ionic/angular/standalone';
import { TranslocoService } from '@jsverse/transloco';
import { I18nService } from '@bk2/shared-i18n';
import { bkPrompt, confirm, error, initAlertTranslation, showToast } from './alert.util';

@Injectable({ providedIn: 'root' })
export class AlertService {
  private readonly alertController = inject(AlertController);
  private readonly toastController = inject(ToastController);
  private readonly i18n = inject(I18nService).translateAll({
    ok:     '@ok',
    cancel: '@cancel',
  });

  constructor() {
    initAlertTranslation(inject(TranslocoService));
  }

  public async confirm(message: string, isCancellable = false, cssClass?: string): Promise<boolean> {
    return confirm(this.alertController, message, this.i18n.ok(), this.i18n.cancel(), isCancellable, cssClass);
  }

  public async bkPrompt(header: string, placeholder: string, value?: string): Promise<string | undefined> {
    return bkPrompt(this.alertController, header, placeholder, this.i18n.ok(), this.i18n.cancel(), value);
  }

  public async showToast(message: string): Promise<void> {
    return showToast(this.toastController, message);
  }

  public error(message: string, isDebugMode = false): undefined {
    return error(this.toastController, message, isDebugMode);
  }
}
```

- [ ] **Step 2: Create `alert.service.spec.ts`**

```typescript
import { TestBed } from '@angular/core/testing';
import { AlertController, ToastController } from '@ionic/angular/standalone';
import { TranslocoService } from '@jsverse/transloco';
import { I18nService } from '@bk2/shared-i18n';
import { signal } from '@angular/core';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AlertService } from './alert.service';

const mockAlert = {
  present: vi.fn().mockResolvedValue(undefined),
  onWillDismiss: vi.fn().mockResolvedValue({ role: 'confirm', data: undefined })
};
const mockToast = { present: vi.fn().mockResolvedValue(undefined) };
const mockAlertController = { create: vi.fn().mockResolvedValue(mockAlert) };
const mockToastController = { create: vi.fn().mockResolvedValue(mockToast) };
const mockI18nService = {
  translateAll: vi.fn().mockReturnValue({
    ok: signal('OK'),
    cancel: signal('Abbrechen')
  })
};
const mockTransloco = { translate: vi.fn((k: string) => k) };

describe('AlertService', () => {
  let service: AlertService;

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [
        AlertService,
        { provide: AlertController, useValue: mockAlertController },
        { provide: ToastController, useValue: mockToastController },
        { provide: I18nService, useValue: mockI18nService },
        { provide: TranslocoService, useValue: mockTransloco },
      ]
    });
    service = TestBed.inject(AlertService);
  });

  describe('confirm', () => {
    it('should call alertController.create with resolved ok/cancel labels', async () => {
      mockAlert.onWillDismiss.mockResolvedValue({ role: 'confirm' });
      const result = await service.confirm('Delete item?', true);
      expect(mockAlertController.create).toHaveBeenCalledWith({
        message: 'Delete item?',
        buttons: [
          { text: 'Abbrechen', role: 'cancel' },
          { text: 'OK', role: 'confirm' }
        ]
      });
      expect(result).toBe(true);
    });

    it('should return false when cancelled', async () => {
      mockAlert.onWillDismiss.mockResolvedValue({ role: 'cancel' });
      expect(await service.confirm('msg', true)).toBe(false);
    });

    it('should create non-cancellable alert', async () => {
      await service.confirm('msg', false);
      const call = (mockAlertController.create as any).mock.calls[0][0];
      expect(call.buttons).toEqual(['OK']);
    });
  });

  describe('bkPrompt', () => {
    it('should call alertController.create with header and labels', async () => {
      mockAlert.onWillDismiss.mockResolvedValue({ role: 'confirm', data: { values: ['typed'] } });
      const result = await service.bkPrompt('Enter name', 'Your name');
      expect(mockAlertController.create).toHaveBeenCalledWith(
        expect.objectContaining({
          header: 'Enter name',
          buttons: [
            { text: 'Abbrechen', role: 'cancel' },
            { text: 'OK', role: 'confirm' }
          ]
        })
      );
      expect(result).toBe('typed');
    });

    it('should return undefined when cancelled', async () => {
      mockAlert.onWillDismiss.mockResolvedValue({ role: 'cancel', data: { values: ['x'] } });
      expect(await service.bkPrompt('h', 'p')).toBeUndefined();
    });
  });

  describe('showToast', () => {
    it('should create toast with the provided message', async () => {
      await service.showToast('Saved');
      expect(mockToastController.create).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Saved' })
      );
      expect(mockToast.present).toHaveBeenCalled();
    });
  });

  describe('error', () => {
    it('should return undefined', () => {
      expect(service.error('oops')).toBeUndefined();
    });

    it('should show toast when message is provided', () => {
      service.error('oops');
      expect(mockToastController.create).toHaveBeenCalled();
    });
  });
});
```

- [ ] **Step 3: Run the tests**

```bash
pnpm run test shared-util-angular 2>&1 | tail -20
```

Expected: all `alert.service` tests pass.

---

### Task 4: Export `AlertService` from `index.ts`

**Files:**
- Modify: `libs/shared/util-angular/src/index.ts`

- [ ] **Step 1: Add export**

Add after the `alert.util` export line:

```typescript
export * from './lib/alert.service';
```

- [ ] **Step 2: Commit tasks 3–4**

```bash
git add libs/shared/util-angular/src/lib/alert.service.ts libs/shared/util-angular/src/lib/alert.service.spec.ts libs/shared/util-angular/src/index.ts
git commit -m "feat(util-angular): add AlertService facade with signal-based ok/cancel labels"
```

---

### Task 5: Migrate `auth.service.ts`

**Files:**
- Modify: `libs/auth/data-access/src/lib/auth.service.ts`

`auth.service.ts` currently injects `AlertController`, `ToastController`, and imports `t` (broken). All showToast/confirm calls use raw `@keys` or concatenated strings.

- [ ] **Step 1: Update imports**

Remove from imports:
- `{ confirm, navigateByUrl, showToast }` → keep only `navigateByUrl`
- `{ die, warn, t }` → keep only `die, warn`
- `AlertController` from `@ionic/angular`
- `ToastController` from `@ionic/angular`

Add:
- `AlertService` from `@bk2/shared-util-angular`
- `I18nService` from `@bk2/shared-i18n`

- [ ] **Step 2: Replace injected fields and add translateAll**

Remove:
```typescript
private readonly toastController = inject(ToastController);
private readonly alertController = inject(AlertController);
```

Add:
```typescript
private readonly alertService = inject(AlertService);
private readonly i18n = inject(I18nService).translateAll({
  login_conf:    '@auth.operation.login.confirmation',
  login_error:   '@auth.operation.login.error',
  pwdreset_conf: '@auth.operation.pwdreset.confirmation',
  pwdreset_error:'@auth.operation.pwdreset.error',
  logout_conf:   '@auth.operation.logout.confirmation',
  logout_error:  '@auth.operation.logout.error',
  logout_confirm:'@content.menuItem.action.logout.confirm',
});
```

- [ ] **Step 3: Replace all call sites**

Replace (line ~56–72, login methods):
```typescript
showToast(this.toastController, '@auth.operation.login.confirmation');
```
with:
```typescript
this.alertService.showToast(this.i18n.login_conf());
```

Replace:
```typescript
await showToast(this.toastController, '@auth.operation.login.error');
```
with:
```typescript
await this.alertService.showToast(this.i18n.login_error());
```

Replace (line ~87, password reset — note string concatenation):
```typescript
await showToast(this.toastController, t('@auth.operation.pwdreset.confirmation') + loginEmail);
```
with:
```typescript
await this.alertService.showToast(this.i18n.pwdreset_conf() + loginEmail);
```

Replace:
```typescript
await showToast(this.toastController, '@auth.operation.pwdreset.error');
```
with:
```typescript
await this.alertService.showToast(this.i18n.pwdreset_error());
```

Replace (line ~115, logout confirm):
```typescript
const result = await confirm(this.alertController, '@content.menuItem.action.logout.confirm', true);
```
with:
```typescript
const result = await this.alertService.confirm(this.i18n.logout_confirm(), true);
```

Replace (line ~119–123, logout toasts):
```typescript
await showToast(this.toastController, '@auth.operation.logout.confirmation');
await showToast(this.toastController, '@auth.operation.logout.error');
```
with:
```typescript
await this.alertService.showToast(this.i18n.logout_conf());
await this.alertService.showToast(this.i18n.logout_error());
```

- [ ] **Step 4: Verify compile**

```bash
npx tsc --noEmit -p libs/auth/data-access/tsconfig.json 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add libs/auth/data-access/src/lib/auth.service.ts
git commit -m "refactor(auth): migrate auth.service to AlertService"
```

---

### Task 6: Migrate `confirm-password-reset.page.ts`

**Files:**
- Modify: `libs/auth/feature/src/lib/confirm-password-reset.page.ts`

This page calls `showToast(this.toastController, 'Passwort für ${email} wurde geändert.')` — a plain German string, no `@key`.

- [ ] **Step 1: Update imports and injection**

Remove from imports: `showToast` from `@bk2/shared-util-angular`, `ToastController` from `@ionic/angular`.

Add to imports: `AlertService` from `@bk2/shared-util-angular`.

Remove injected field:
```typescript
private readonly toastController = inject(ToastController);
```

Add:
```typescript
private readonly alertService = inject(AlertService);
```

- [ ] **Step 2: Replace call site (line ~143)**

```typescript
// before
await showToast(this.toastController, `Passwort für ${email} wurde geändert.`);

// after
await this.alertService.showToast(`Passwort für ${email} wurde geändert.`);
```

- [ ] **Step 3: Verify and commit**

```bash
npx tsc --noEmit -p libs/auth/feature/tsconfig.json 2>&1 | head -10
git add libs/auth/feature/src/lib/confirm-password-reset.page.ts
git commit -m "refactor(auth): migrate confirm-password-reset page to AlertService"
```

---

### Task 7: Migrate `folder.store.ts` and `comment-list.store.ts`

**Files:**
- Modify: `libs/folder/feature/src/lib/folder.store.ts`
- Modify: `libs/comment/feature/src/lib/comment-list.store.ts`

#### `folder.store.ts`

Currently: `confirm(store.alertController, '@folder.operation.delete.confirm', true)`.
The store does NOT have `i18nService` yet.

- [ ] **Step 1: Update `folder.store.ts`**

Add to imports:
```typescript
import { I18nService } from '@bk2/shared-i18n';
import { AlertService } from '@bk2/shared-util-angular';
```

Remove from imports: `confirm` from `@bk2/shared-util-angular`, `AlertController` from `@ionic/angular`.

In the store's `withState` / `withMethods` block, replace:
```typescript
alertController: inject(AlertController),
```
with:
```typescript
alertService: inject(AlertService),
i18nService: inject(I18nService),
```

Add `i18n` to the store state initializer (called once, in injection context):
```typescript
i18n: store.i18nService.translateAll({
  delete_confirm: '@folder.operation.delete.confirm',
}),
```

Replace call site:
```typescript
// before
const result = await confirm(store.alertController, '@folder.operation.delete.confirm', true);

// after
const result = await store.alertService.confirm(store.i18n.delete_confirm(), true);
```

#### `comment-list.store.ts`

Currently: `bkPrompt(store.alertController, '@comment.operation.add.title', '@comment.operation.add.placeholder')`.

- [ ] **Step 2: Update `comment-list.store.ts`**

Add to imports:
```typescript
import { I18nService } from '@bk2/shared-i18n';
import { AlertService } from '@bk2/shared-util-angular';
```

Remove from imports: `bkPrompt` from `@bk2/shared-util-angular`, `AlertController` from `@ionic/angular`.

Replace in store state:
```typescript
alertController: inject(AlertController),
```
with:
```typescript
alertService: inject(AlertService),
i18nService: inject(I18nService),
```

Add `i18n`:
```typescript
i18n: store.i18nService.translateAll({
  add_title:       '@comment.operation.add.title',
  add_placeholder: '@comment.operation.add.placeholder',
}),
```

Replace call site:
```typescript
// before
comment = await bkPrompt(store.alertController, '@comment.operation.add.title', '@comment.operation.add.placeholder');

// after
comment = await store.alertService.bkPrompt(store.i18n.add_title(), store.i18n.add_placeholder());
```

- [ ] **Step 3: Verify and commit**

```bash
npx tsc --noEmit -p libs/folder/feature/tsconfig.json 2>&1 | head -10
npx tsc --noEmit -p libs/comment/feature/tsconfig.json 2>&1 | head -10
git add libs/folder/feature/src/lib/folder.store.ts libs/comment/feature/src/lib/comment-list.store.ts
git commit -m "refactor(folder,comment): migrate stores to AlertService"
```

---

### Task 8: Migrate stores that already have `translateAll` (`group.store.ts`, `addresses.store.ts`)

These stores already inject `I18nService` and use `translateAll`. They just need to inject `AlertService` and update call sites.

**Files:**
- Modify: `libs/subject/group/feature/src/lib/group.store.ts`
- Modify: `libs/subject/address/feature/src/lib/addresses.store.ts`

#### `group.store.ts`

Note: `group.store.ts` also uses `store.alertController.create(...)` directly (for the duplicate-group dialog at line ~235). Keep `alertController` in store state for that usage. Only migrate the `confirm(store.alertController, ...)` call.

- [ ] **Step 1: Update `group.store.ts`**

Add to imports: `AlertService` from `@bk2/shared-util-angular`.
Remove from imports: `confirm` from `@bk2/shared-util-angular`.

Add to store state (keep `alertController` for direct use):
```typescript
alertService: inject(AlertService),
```

Add to existing `translateAll` block (in `i18n: store.i18nService.translateAll({...})`):
```typescript
ok: '@ok',
```
(needed for the direct `alertController.create` call at line ~238 which uses `store.i18n.ok()`).

Replace call site (line ~277):
```typescript
// before
const result = await confirm(store.alertController, store.i18n.group_delete_confirm(), true);

// after
const result = await store.alertService.confirm(store.i18n.group_delete_confirm(), true);
```

#### `addresses.store.ts`

- [ ] **Step 2: Update `addresses.store.ts`**

Add to imports: `AlertService` from `@bk2/shared-util-angular`.
Remove from imports: `confirm` from `@bk2/shared-util-angular`.

In store state, replace:
```typescript
alertController: inject(AlertController),
```
with:
```typescript
alertService: inject(AlertService),
```

Remove `AlertController` import from `@ionic/angular` if no longer needed.

Replace call site (line ~221):
```typescript
// before
const result = await confirm(store.alertController, store.i18n.delete_confirm(), true);

// after
const result = await store.alertService.confirm(store.i18n.delete_confirm(), true);
```

- [ ] **Step 3: Verify and commit**

```bash
npx tsc --noEmit -p libs/subject/group/feature/tsconfig.json 2>&1 | head -10
npx tsc --noEmit -p libs/subject/address/feature/tsconfig.json 2>&1 | head -10
git add libs/subject/group/feature/src/lib/group.store.ts libs/subject/address/feature/src/lib/addresses.store.ts
git commit -m "refactor(group,address): migrate stores to AlertService"
```

---

### Task 9: Migrate `person.store.ts` and `org.store.ts`

**Files:**
- Modify: `libs/subject/person/feature/src/lib/person.store.ts`
- Modify: `libs/subject/org/feature/src/lib/org.store.ts`

#### `person.store.ts`

Has two `confirm` calls: one with a raw key (`'@subject.person.operation.create.exists.error'`), one with an already-resolved signal.

- [ ] **Step 1: Update `person.store.ts`**

Add to imports: `AlertService` from `@bk2/shared-util-angular`.
Remove from imports: `confirm` from `@bk2/shared-util-angular`.

In store state, replace:
```typescript
alertController: inject(AlertController),
```
with:
```typescript
alertService: inject(AlertService),
```

Add `create_exists_error` to existing `translateAll` block:
```typescript
create_exists_error: '@subject.person.operation.create.exists.error',
```

Replace call sites:
```typescript
// before (line ~204)
if (!confirm(store.alertController, '@subject.person.operation.create.exists.error', true)) return;

// after
if (!await store.alertService.confirm(store.i18n.create_exists_error(), true)) return;
```

```typescript
// before (line ~294)
const result = await confirm(store.alertController, store.i18n.person_delete_confirm(), true);

// after
const result = await store.alertService.confirm(store.i18n.person_delete_confirm(), true);
```

Note: `toastController` is still needed in `person.store.ts` for `copyToClipboardWithConfirmation`. Keep it.

#### `org.store.ts`

- [ ] **Step 2: Update `org.store.ts`**

Add to imports: `AlertService` from `@bk2/shared-util-angular`, `I18nService` from `@bk2/shared-i18n`.
Remove from imports: `confirm` from `@bk2/shared-util-angular`.

In store state, replace:
```typescript
alertController: inject(AlertController),
```
with:
```typescript
alertService: inject(AlertService),
i18nService: inject(I18nService),
```

Add `i18n` to store state initializer:
```typescript
i18n: store.i18nService.translateAll({
  delete_confirm: '@subject.person.operation.delete.confirm',
}),
```

Replace call site (line ~200):
```typescript
// before
const result = await confirm(store.alertController, '@subject.person.operation.delete.confirm', true);

// after
const result = await store.alertService.confirm(store.i18n.delete_confirm(), true);
```

Note: `toastController` stays in `org.store.ts` for `copyToClipboardWithConfirmation`.

- [ ] **Step 3: Verify and commit**

```bash
npx tsc --noEmit -p libs/subject/person/feature/tsconfig.json 2>&1 | head -10
npx tsc --noEmit -p libs/subject/org/feature/tsconfig.json 2>&1 | head -10
git add libs/subject/person/feature/src/lib/person.store.ts libs/subject/org/feature/src/lib/org.store.ts
git commit -m "refactor(person,org): migrate stores to AlertService"
```

---

### Task 10: Migrate `matrix-chat.store.ts`

**Files:**
- Modify: `libs/chat/feature/src/lib/matrix-chat.store.ts`

This is the largest migration. It has 3 `bkPrompt` calls (with raw keys for header/placeholder), 1 `confirm` call, and ~10 `showToast` calls — all with raw `@keys`. It currently has no `I18nService`.

- [ ] **Step 1: Update imports**

Add to imports:
```typescript
import { I18nService } from '@bk2/shared-i18n';
import { AlertService } from '@bk2/shared-util-angular';
```

Remove from imports: `bkPrompt, confirm, showToast` from `@bk2/shared-util-angular`.

- [ ] **Step 2: Replace injected fields in store state**

Replace:
```typescript
toastController: inject(ToastController),
alertController: inject(AlertController),
```
with:
```typescript
alertService: inject(AlertService),
i18nService: inject(I18nService),
```

Remove `AlertController` and `ToastController` from `@ionic/angular` imports (if no longer needed).

- [ ] **Step 3: Add `i18n` to store state initializer**

Add (in the same object where other state is initialized):
```typescript
i18n: store.i18nService.translateAll({
  room_create_conf:          '@chat.operation.room.create.conf',
  room_create_error:         '@chat.operation.room.create.error',
  room_update_conf:          '@chat.operation.room.update.conf',
  room_update_error:         '@chat.operation.room.update.error',
  thread_reply_header:       '@chat.operation.thread.reply.header',
  thread_reply_placeholder:  '@chat.operation.thread.reply.placeholder',
  thread_reply_error:        '@chat.operation.thread.reply.error',
  msg_report_header:         '@chat.operation.message.report.header',
  msg_report_placeholder:    '@chat.operation.message.report.placeholder',
  msg_report_noChannel:      '@chat.operation.message.report.noChannel',
  msg_report_conf:           '@chat.operation.message.report.conf',
  msg_report_error:          '@chat.operation.message.report.error',
  msg_update_header:         '@chat.operation.message.update.header',
  msg_update_placeholder:    '@chat.operation.message.update.placeholder',
  msg_update_conf:           '@chat.operation.message.update.conf',
  msg_update_error:          '@chat.operation.message.update.error',
  msg_delete_confirm:        '@chat.operation.message.delete.confirm',
  msg_delete_conf:           '@chat.operation.message.delete.conf',
  msg_delete_error:          '@chat.operation.message.delete.error',
}),
```

- [ ] **Step 4: Replace all call sites**

Replace (line ~416):
```typescript
showToast(store.toastController, '@chat.operation.room.create.conf');
```
→ `await store.alertService.showToast(store.i18n.room_create_conf());`

Replace (line ~421):
```typescript
showToast(store.toastController, '@chat.operation.room.create.error');
```
→ `await store.alertService.showToast(store.i18n.room_create_error());`

Replace (line ~448):
```typescript
showToast(store.toastController, '@chat.operation.room.update.conf');
```
→ `await store.alertService.showToast(store.i18n.room_update_conf());`

Replace (line ~451):
```typescript
showToast(store.toastController, '@chat.operation.room.update.error');
```
→ `await store.alertService.showToast(store.i18n.room_update_error());`

Replace (line ~654):
```typescript
const text = await bkPrompt(store.alertController as any, '@chat.operation.thread.reply.header', '@chat.operation.thread.reply.placeholder');
```
→ `const text = await store.alertService.bkPrompt(store.i18n.thread_reply_header(), store.i18n.thread_reply_placeholder());`

Replace (line ~661):
```typescript
showToast(store.toastController, '@chat.operation.thread.reply.error');
```
→ `await store.alertService.showToast(store.i18n.thread_reply_error());`

Replace (line ~669):
```typescript
const comment = await bkPrompt(store.alertController as any, '@chat.operation.message.report.header', '@chat.operation.message.report.placeholder');
```
→ `const comment = await store.alertService.bkPrompt(store.i18n.msg_report_header(), store.i18n.msg_report_placeholder());`

Replace (line ~674):
```typescript
showToast(store.toastController, '@chat.operation.message.report.noChannel');
```
→ `await store.alertService.showToast(store.i18n.msg_report_noChannel());`

Replace (line ~697):
```typescript
showToast(store.toastController, '@chat.operation.message.report.conf');
```
→ `await store.alertService.showToast(store.i18n.msg_report_conf());`

Replace (line ~700):
```typescript
showToast(store.toastController, '@chat.operation.message.report.error');
```
→ `await store.alertService.showToast(store.i18n.msg_report_error());`

Replace (line ~731, note: `message.body` is the `value` arg):
```typescript
const newText = await bkPrompt(store.alertController as any, '@chat.operation.message.update.header', '@chat.operation.message.update.placeholder', message.body);
```
→ `const newText = await store.alertService.bkPrompt(store.i18n.msg_update_header(), store.i18n.msg_update_placeholder(), message.body);`

Replace (line ~735):
```typescript
showToast(store.toastController, '@chat.operation.message.update.conf');
```
→ `await store.alertService.showToast(store.i18n.msg_update_conf());`

Replace (line ~738):
```typescript
showToast(store.toastController, '@chat.operation.message.update.error');
```
→ `await store.alertService.showToast(store.i18n.msg_update_error());`

Replace (line ~748):
```typescript
const ok = await confirm(store.alertController as any, '@chat.operation.message.delete.confirm', true);
```
→ `const ok = await store.alertService.confirm(store.i18n.msg_delete_confirm(), true);`

Replace (line ~752):
```typescript
showToast(store.toastController, '@chat.operation.message.delete.conf');
```
→ `await store.alertService.showToast(store.i18n.msg_delete_conf());`

Replace (line ~755):
```typescript
showToast(store.toastController, '@chat.operation.message.delete.error');
```
→ `await store.alertService.showToast(store.i18n.msg_delete_error());`

- [ ] **Step 5: Verify and commit**

```bash
npx tsc --noEmit -p libs/chat/feature/tsconfig.json 2>&1 | head -20
git add libs/chat/feature/src/lib/matrix-chat.store.ts
git commit -m "refactor(chat): migrate matrix-chat.store to AlertService"
```

---

### Task 11: Migrate `location-list.store.ts`

**Files:**
- Modify: `libs/geo/location/feature/src/lib/location-list.store.ts`

Currently imports `t` from `@bk2/shared-util-core` (broken) and calls `showToast(store.toastController, t('@location.operation.copy.conf'))`.

- [ ] **Step 1: Update `location-list.store.ts`**

Remove from imports: `t` from `@bk2/shared-util-core`, `showToast` from `@bk2/shared-util-angular`, `ToastController` from `@ionic/angular`.

Add to imports:
```typescript
import { I18nService } from '@bk2/shared-i18n';
import { AlertService } from '@bk2/shared-util-angular';
```

In store state, replace:
```typescript
toastController: inject(ToastController),
```
with:
```typescript
alertService: inject(AlertService),
i18nService: inject(I18nService),
```

Add `i18n` to the store state initializer (in injection context, same object level as other state):
```typescript
i18n: store.i18nService.translateAll({
  copy_conf: '@location.operation.copy.conf',
}),
```

Replace call site (line ~182):
```typescript
// before
await showToast(store.toastController, t('@location.operation.copy.conf'));

// after
await store.alertService.showToast(store.i18n.copy_conf());
```

- [ ] **Step 2: Verify and commit**

```bash
npx tsc --noEmit -p libs/geo/location/feature/tsconfig.json 2>&1 | head -10
git add libs/geo/location/feature/src/lib/location-list.store.ts
git commit -m "refactor(location): migrate location-list.store to AlertService"
```

---

### Task 12: Migrate `matrix-chat.ts` component

**Files:**
- Modify: `libs/chat/feature/src/lib/matrix-chat.ts`

Uses `showToast(this.toastController, msg)` with plain strings and template literals.

- [ ] **Step 1: Update `matrix-chat.ts`**

Remove from imports: `showToast` from `@bk2/shared-util-angular`, `ToastController` from `@ionic/angular`.

Add to imports: `AlertService` from `@bk2/shared-util-angular`.

Replace injected field:
```typescript
private readonly toastController = inject(ToastController);
```
with:
```typescript
private readonly alertService = inject(AlertService);
```

Replace all call sites:
```typescript
// before
await showToast(this.toastController, msg);
// after
await this.alertService.showToast(msg);

// before
await showToast(this.toastController, `${failures} Bild(er) konnten nicht gesendet werden`);
// after
await this.alertService.showToast(`${failures} Bild(er) konnten nicht gesendet werden`);

// before
await showToast(this.toastController, `${failures} Datei(en) konnten nicht gesendet werden`);
// after
await this.alertService.showToast(`${failures} Datei(en) konnten nicht gesendet werden`);

// before
await showToast(this.toastController, 'Video-Call fehlgeschlagen');
// after
await this.alertService.showToast('Video-Call fehlgeschlagen');
```

- [ ] **Step 2: Verify and commit**

```bash
npx tsc --noEmit -p libs/chat/feature/tsconfig.json 2>&1 | head -10
git add libs/chat/feature/src/lib/matrix-chat.ts
git commit -m "refactor(chat): migrate matrix-chat component to AlertService"
```

---

### Task 13: Migrate `geocode.service.ts`

**Files:**
- Modify: `libs/subject/address/data-access/src/lib/geocode.service.ts`

Uses `error(this.toastController, 'Address not found')` — plain strings.

- [ ] **Step 1: Update `geocode.service.ts`**

Remove from imports: `error` from `@bk2/shared-util-angular`, `ToastController` from `@ionic/angular`.

Add to imports: `AlertService` from `@bk2/shared-util-angular`.

Replace field:
```typescript
private readonly toastController = inject(ToastController);
```
with:
```typescript
private readonly alertService = inject(AlertService);
```

Replace call sites:
```typescript
// before
error(this.toastController, 'Address not found');
error(this.toastController, 'Error geocoding address');

// after
this.alertService.error('Address not found');
this.alertService.error('Error geocoding address');
```

- [ ] **Step 2: Verify and commit**

```bash
npx tsc --noEmit -p libs/subject/address/data-access/tsconfig.json 2>&1 | head -10
git add libs/subject/address/data-access/src/lib/geocode.service.ts
git commit -m "refactor(address): migrate geocode.service to AlertService"
```

---

### Task 14: Migrate component callers (error-only)

These components all call `error(undefined, msg)` — no toast controller. Migration is mechanical: inject `AlertService`, remove the `undefined` first argument.

**Files:**
- `libs/category/feature/src/lib/category-list.component.ts`
- `libs/folder/feature/src/lib/folder-list.component.ts`
- `libs/subject/group/feature/src/lib/group-list.component.ts`
- `libs/subject/person/feature/src/lib/person-list.ts`
- `libs/subject/org/feature/src/lib/org-list.component.ts`
- `libs/subject/address/feature/src/lib/addresses-list.ts`
- `libs/geo/location/feature/src/lib/location-list.component.ts`

For each file, apply the same pattern:

- [ ] **Step 1: Update imports**

Remove: `error` from `@bk2/shared-util-angular` (keep other imports from that package).
Add: `AlertService` from `@bk2/shared-util-angular`.

- [ ] **Step 2: Add injection**

```typescript
private readonly alertService = inject(AlertService);
```

- [ ] **Step 3: Replace call site**

```typescript
// before
error(undefined, `SomeComponent.method: unknown method ${selectedMethod}`);

// after
this.alertService.error(`SomeComponent.method: unknown method ${selectedMethod}`);
```

Apply this to all 7 files above.

- [ ] **Step 4: Verify all compile**

```bash
npx tsc --noEmit -p libs/category/feature/tsconfig.json 2>&1 | head -5
npx tsc --noEmit -p libs/folder/feature/tsconfig.json 2>&1 | head -5
npx tsc --noEmit -p libs/subject/group/feature/tsconfig.json 2>&1 | head -5
npx tsc --noEmit -p libs/subject/person/feature/tsconfig.json 2>&1 | head -5
npx tsc --noEmit -p libs/subject/org/feature/tsconfig.json 2>&1 | head -5
npx tsc --noEmit -p libs/subject/address/feature/tsconfig.json 2>&1 | head -5
npx tsc --noEmit -p libs/geo/location/feature/tsconfig.json 2>&1 | head -5
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add \
  libs/category/feature/src/lib/category-list.component.ts \
  libs/folder/feature/src/lib/folder-list.component.ts \
  libs/subject/group/feature/src/lib/group-list.component.ts \
  libs/subject/person/feature/src/lib/person-list.ts \
  libs/subject/org/feature/src/lib/org-list.component.ts \
  libs/subject/address/feature/src/lib/addresses-list.ts \
  libs/geo/location/feature/src/lib/location-list.component.ts
git commit -m "refactor: migrate component error() callers to AlertService"
```

---

### Task 15: Final type-check and full test run

- [ ] **Step 1: Type-check shared-util-angular**

```bash
npx tsc --noEmit -p libs/shared/util-angular/tsconfig.json
```

Expected: zero errors.

- [ ] **Step 2: Run all tests**

```bash
pnpm run test shared-util-angular 2>&1 | tail -20
```

Expected: all pass.

- [ ] **Step 3: Spot-check the app build**

```bash
pnpm nx build scs-app 2>&1 | tail -30
```

Expected: build succeeds.

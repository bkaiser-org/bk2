# DeepSign Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate DeepSign e-signature API so users can send PDFs for signing, track signee progress live, and download signed copies.

**Architecture:** Seven `onCall` Cloud Functions plus one `onRequest` webhook and one Firestore `onUpdate` trigger under `apps/functions/src/esign/`. The Angular client (`libs/esign/`) queries Firestore for live status and calls CFs for mutations. Clients never write directly to Firestore; all writes happen via CFs.

**Tech Stack:** Firebase Functions v2 (Gen 2), DeepSign API v1, `axios` (already installed), Angular 20 NgRx Signal Store, `rxfire/firestore` for live subscriptions, `firebase/functions` `httpsCallable`.

---

## File Map

**Create (Cloud Functions):**
- `apps/functions/src/esign/shared.ts` — secrets, constants, token cache, HMAC helper
- `apps/functions/src/esign/esign-scan-predefined.ts` — dry-run scan for signee detection
- `apps/functions/src/esign/esign-send-document.ts` — primary upload + start flow
- `apps/functions/src/esign/esign-get-document-details.ts` — refresh preview URL + signees
- `apps/functions/src/esign/esign-resend-invitation.ts` — resend invite to a pending signee
- `apps/functions/src/esign/esign-delete.ts` — status-aware withdraw + delete
- `apps/functions/src/esign/esign-send-by-email.ts` — email signed PDF to recipients
- `apps/functions/src/esign/esign-webhook.ts` — HTTP onRequest for DeepSign callbacks
- `apps/functions/src/esign/esign-archive-signed.ts` — Firestore trigger archives signed PDF
- `apps/functions/src/esign/index.ts` — re-exports

**Create (shared model):**
- `libs/shared/models/src/lib/esign.model.ts` — EsignRecord interface + collection constants

**Create (client libs):**
- `libs/esign/data-access/tsconfig.json`
- `libs/esign/data-access/tsconfig.lib.json`
- `libs/esign/data-access/package.json`
- `libs/esign/data-access/project.json`
- `libs/esign/data-access/src/index.ts`
- `libs/esign/data-access/src/lib/esign.service.ts`
- `libs/esign/feature/tsconfig.json`
- `libs/esign/feature/tsconfig.lib.json`
- `libs/esign/feature/package.json`
- `libs/esign/feature/project.json`
- `libs/esign/feature/src/index.ts`
- `libs/esign/feature/src/lib/esign.store.ts`
- `libs/esign/feature/src/lib/esign-list.ts`
- `libs/esign/feature/src/lib/esign-view.modal.ts`
- `libs/esign/feature/src/lib/esign-delete-confirm.modal.ts`
- `libs/esign/feature/src/i18n/de.json`

**Modify:**
- `libs/shared/models/src/index.ts` — add `export * from './lib/esign.model'`
- `apps/functions/src/main.ts` — import + export Esign functions
- `firestore.rules` — add `esignList` and `esignAudit` rules
- `tsconfig.base.json` — add `@bk2/esign-data-access`, `@bk2/esign-feature` aliases
- `apps/scs-app/src/app/app.routes.ts` — add `/esign` route
- `apps/scs-app/project.json` — add i18n asset glob

---

### Task 1: EsignRecord shared model

**Files:**
- Create: `libs/shared/models/src/lib/esign.model.ts`
- Modify: `libs/shared/models/src/index.ts`

- [ ] **Step 1: Create the model file**

```typescript
// libs/shared/models/src/lib/esign.model.ts
import type { Timestamp } from 'firebase/firestore';

export type EsignDocumentStatus =
  | 'uploading' | 'draft' | 'in-progress'
  | 'signed' | 'withdrawn' | 'rejected' | 'error';

export type EsignSignStatus =
  | 'on-hold' | 'pending' | 'in-progress' | 'signed' | 'rejected';

export interface EsignSignee {
  signeeId: string;
  email: string;
  name?: string;
  signOrder: number;
  signStatus: EsignSignStatus;
  viewedTime?: Timestamp;
  signedTime?: Timestamp;
  completionTime?: Timestamp;
  signeeComment?: string;
}

export interface EsignEvent {
  type: 'created' | 'started' | 'signee-viewed' | 'signee-signed'
      | 'signee-rejected' | 'completed' | 'withdrawn' | 'error';
  at: Timestamp;
  signeeId?: string;
  payload?: Record<string, unknown>;
}

export interface EsignRecord {
  esignId: string;
  tenantId: string;
  ownerUserId: string;
  source: 'user-upload' | 'cf-generated';
  sourceRef?: string;
  documentName: string;
  storagePath: string;
  signedPdfPath?: string;
  deepsignDocumentId: string;
  documentStatus: EsignDocumentStatus;
  signStatus?: EsignSignStatus;
  signatureMode: 'timestamp' | 'advanced' | 'qualified';
  jurisdiction: 'zertes' | 'eidas';
  comment?: string;
  initiatorAliasName: string;
  signees: EsignSignee[];
  events: EsignEvent[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
  startedAt?: Timestamp;
  completionTime?: Timestamp;
  errorMessage?: string;
}

export const EsignCollection = 'esignList';
export const EsignAuditCollection = 'esignAudit';
```

- [ ] **Step 2: Add export to shared models index**

In `libs/shared/models/src/index.ts`, add after the existing model exports (find the line `export * from './lib/expense.model'` and add after it):

```typescript
export * from './lib/esign.model';
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit -p libs/shared/models/tsconfig.json
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add libs/shared/models/src/lib/esign.model.ts libs/shared/models/src/index.ts
git commit -m "feat(esign): add EsignRecord to shared-models"
```

---

### Task 2: CF shared infrastructure

**Files:**
- Create: `apps/functions/src/esign/shared.ts`

- [ ] **Step 1: Create shared.ts with secrets, constants, token cache, HMAC helpers**

```typescript
// apps/functions/src/esign/shared.ts
import { createHmac, timingSafeEqual } from 'crypto';
import { defineSecret } from 'firebase-functions/params';
import axios from 'axios';

// ─── Secrets ─────────────────────────────────────────────────────────────────
export const deepsignClientId       = defineSecret('DEEPSIGN_CLIENT_ID');
export const deepsignClientSecret   = defineSecret('DEEPSIGN_CLIENT_SECRET');
export const deepsignServiceUsername = defineSecret('DEEPSIGN_SERVICE_USERNAME');
export const deepsignServicePassword = defineSecret('DEEPSIGN_SERVICE_PASSWORD');
export const webhookSecret          = defineSecret('WEBHOOK_SECRET');

export const ALL_ESIGN_SECRETS = [
  deepsignClientId, deepsignClientSecret,
  deepsignServiceUsername, deepsignServicePassword,
  webhookSecret,
] as const;

// ─── Runtime constants ────────────────────────────────────────────────────────
export const DEEPSIGN_API_BASE = 'https://api.sign.deepbox.swiss/api/v1';
export const DEEPSIGN_AUTH_URL =
  'https://deepcloud.swiss/auth/realms/sso/protocol/openid-connect/token';
export const REGION = 'europe-west6';
export const MAX_FILE_BYTES = 40 * 1024 * 1024; // 40 MB

// ─── Token cache ─────────────────────────────────────────────────────────────
interface TokenCache { accessToken: string; expiresAt: number }
let tokenCache: TokenCache | null = null;

export async function getDeepSignAccessToken(
  clientId: string,
  clientSecret: string,
  username: string,
  password: string,
): Promise<string> {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt > now + 60_000) {
    return tokenCache.accessToken;
  }
  const params = new URLSearchParams({
    grant_type: 'password',
    client_id: clientId,
    client_secret: clientSecret,
    username,
    password,
  });
  const response = await axios.post<{ access_token: string; expires_in: number }>(
    DEEPSIGN_AUTH_URL,
    params.toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
  );
  const { access_token, expires_in } = response.data;
  tokenCache = { accessToken: access_token, expiresAt: now + expires_in * 1000 };
  return access_token;
}

// ─── HMAC helpers ─────────────────────────────────────────────────────────────
export function computeWebhookToken(esignId: string, secret: string): string {
  return createHmac('sha256', secret).update(esignId).digest('hex');
}

export function verifyWebhookToken(esignId: string, token: string, secret: string): boolean {
  const expected = computeWebhookToken(esignId, secret);
  try {
    const a = Buffer.from(expected, 'hex');
    const b = Buffer.from(token, 'hex');
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// ─── Storage helper ───────────────────────────────────────────────────────────
import { getStorage } from 'firebase-admin/storage';

export async function downloadFromStorage(storagePath: string): Promise<Buffer> {
  const [buffer] = await getStorage().bucket().file(storagePath).download();
  if (buffer.length > MAX_FILE_BYTES) {
    throw new Error(`File exceeds 40 MB limit (${buffer.length} bytes)`);
  }
  return buffer;
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/functions/src/esign/shared.ts
git commit -m "feat(esign): CF shared infrastructure — token cache, HMAC, storage helper"
```

---

### Task 3: CF esignScanPredefined

**Files:**
- Create: `apps/functions/src/esign/esign-scan-predefined.ts`

- [ ] **Step 1: Implement esignScanPredefined**

```typescript
// apps/functions/src/esign/esign-scan-predefined.ts
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import axios from 'axios';
import {
  ALL_ESIGN_SECRETS, DEEPSIGN_API_BASE, REGION,
  getDeepSignAccessToken, downloadFromStorage,
  deepsignClientId, deepsignClientSecret,
  deepsignServiceUsername, deepsignServicePassword,
} from './shared';

interface ScanPredefinedRequest { storagePath: string }

export const esignScanPredefined = onCall<ScanPredefinedRequest>(
  { region: REGION, enforceAppCheck: true, secrets: ALL_ESIGN_SECRETS },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required');
    const { storagePath } = request.data;
    if (!storagePath) throw new HttpsError('invalid-argument', 'storagePath required');

    const token = await getDeepSignAccessToken(
      deepsignClientId.value(), deepsignClientSecret.value(),
      deepsignServiceUsername.value(), deepsignServicePassword.value(),
    );

    const buffer = await downloadFromStorage(storagePath);
    const filename = storagePath.split('/').pop() ?? 'document.pdf';

    const formData = new FormData();
    formData.set('file', new Blob([buffer], { type: 'application/pdf' }), filename);

    const response = await axios.post(
      `${DEEPSIGN_API_BASE}/documents/file/scan-predefined`,
      formData,
      { headers: { Authorization: `Bearer ${token}` } },
    );

    logger.info('esignScanPredefined: scan complete', { storagePath, fields: response.data?.signatureFields?.length });
    return response.data;
  },
);
```

- [ ] **Step 2: Commit**

```bash
git add apps/functions/src/esign/esign-scan-predefined.ts
git commit -m "feat(esign): CF esignScanPredefined dry-run validation"
```

---

### Task 4: CF esignSendDocument

**Files:**
- Create: `apps/functions/src/esign/esign-send-document.ts`

- [ ] **Step 1: Implement esignSendDocument**

```typescript
// apps/functions/src/esign/esign-send-document.ts
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import axios from 'axios';
import {
  ALL_ESIGN_SECRETS, DEEPSIGN_API_BASE, REGION,
  getDeepSignAccessToken, downloadFromStorage, computeWebhookToken,
  deepsignClientId, deepsignClientSecret,
  deepsignServiceUsername, deepsignServicePassword, webhookSecret,
} from './shared';
import { EsignCollection } from '@bk2/shared-models';

export interface EsignSendDocumentRequest {
  storagePath: string;
  documentName?: string;
  initiatorAliasName: string;
  comment?: string;
  signatureMode?: 'timestamp' | 'advanced' | 'qualified';
  jurisdiction?: 'zertes' | 'eidas';
  sendMail?: 'all' | 'others' | 'none';
  source: 'user-upload' | 'cf-generated';
  sourceRef?: string;
}

export const esignSendDocument = onCall<EsignSendDocumentRequest>(
  { region: REGION, enforceAppCheck: true, secrets: ALL_ESIGN_SECRETS },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required');

    const userId = request.auth.uid;
    const tenantId = typeof request.auth.token['tenantId'] === 'string'
      ? request.auth.token['tenantId'] : '';
    const {
      storagePath, initiatorAliasName, comment,
      signatureMode = 'timestamp', jurisdiction = 'zertes',
      sendMail = 'all', source, sourceRef,
    } = request.data;

    if (!storagePath) throw new HttpsError('invalid-argument', 'storagePath required');
    if (!initiatorAliasName) throw new HttpsError('invalid-argument', 'initiatorAliasName required');

    const filename = storagePath.split('/').pop() ?? 'document.pdf';
    const documentName = request.data.documentName ?? filename;

    const db = getFirestore();

    // Pre-create the esignList record with status 'uploading'
    const docRef = db.collection(EsignCollection).doc();
    const esignId = docRef.id;
    const now = Timestamp.now();
    await docRef.set({
      esignId,
      tenantId,
      ownerUserId: userId,
      source,
      ...(sourceRef ? { sourceRef } : {}),
      documentName,
      storagePath,
      deepsignDocumentId: '',
      documentStatus: 'uploading',
      signatureMode,
      jurisdiction,
      ...(comment ? { comment } : {}),
      initiatorAliasName,
      signees: [],
      events: [{ type: 'created', at: now }],
      createdAt: now,
      updatedAt: now,
    });

    try {
      // Download PDF and acquire token in parallel
      const [buffer, token] = await Promise.all([
        downloadFromStorage(storagePath),
        getDeepSignAccessToken(
          deepsignClientId.value(), deepsignClientSecret.value(),
          deepsignServiceUsername.value(), deepsignServicePassword.value(),
        ),
      ]);

      const webhookToken = computeWebhookToken(esignId, webhookSecret.value());
      const projectId = process.env['GCLOUD_PROJECT'] ?? '';
      const webhookBase = `https://${REGION}-${projectId}.cloudfunctions.net/esignWebhook`;
      const webhookUrl = `${webhookBase}?esignId=${esignId}&token=${webhookToken}`;

      const docData = {
        initiatorAliasName,
        sendMail,
        ...(comment ? { comment } : {}),
        signatureMode,
        jurisdiction,
        scanPredefined: true,
        callbacks: { documentStatusUrl: webhookUrl, signeeStatusUrl: webhookUrl },
      };

      const formData = new FormData();
      formData.set('data', new Blob([JSON.stringify(docData)], { type: 'application/json' }));
      formData.set('file', new Blob([buffer], { type: 'application/pdf' }), filename);

      // Upload to DeepSign
      const uploadResponse = await axios.post<{
        documentId: string;
        documentStatus: string;
        signees: unknown[];
        signeesOrdered: boolean;
        creationTime: string;
      }>(
        `${DEEPSIGN_API_BASE}/documents/file`,
        formData,
        { headers: { Authorization: `Bearer ${token}` } },
      );

      const { documentId, documentStatus, signees, signeesOrdered, creationTime } = uploadResponse.data;

      await docRef.update({
        deepsignDocumentId: documentId,
        documentStatus: 'draft',
        signees,
        signeesOrdered,
        deepsignCreationTime: creationTime,
        updatedAt: FieldValue.serverTimestamp(),
      });

      // Start the signing process
      await axios.put(
        `${DEEPSIGN_API_BASE}/documents/${documentId}/start`,
        {},
        { headers: { Authorization: `Bearer ${token}` } },
      );

      const startedAt = Timestamp.now();
      await docRef.update({
        documentStatus: 'in-progress',
        startedAt,
        updatedAt: FieldValue.serverTimestamp(),
        events: FieldValue.arrayUnion({ type: 'started', at: startedAt }),
      });

      logger.info('esignSendDocument: started', { esignId, documentId });
      return { esignId, documentId, signees };

    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      await docRef.update({
        documentStatus: 'error',
        errorMessage: message,
        updatedAt: FieldValue.serverTimestamp(),
        events: FieldValue.arrayUnion({ type: 'error', at: Timestamp.now(), payload: { message } }),
      });
      logger.error('esignSendDocument: failed', { esignId, error: message });
      throw new HttpsError('internal', `DeepSign upload failed: ${message}`);
    }
  },
);
```

- [ ] **Step 2: Commit**

```bash
git add apps/functions/src/esign/esign-send-document.ts
git commit -m "feat(esign): CF esignSendDocument — upload, start, record lifecycle"
```

---

### Task 5: CF esignGetDocumentDetails + esignResendInvitation

**Files:**
- Create: `apps/functions/src/esign/esign-get-document-details.ts`
- Create: `apps/functions/src/esign/esign-resend-invitation.ts`

- [ ] **Step 1: Implement esignGetDocumentDetails**

```typescript
// apps/functions/src/esign/esign-get-document-details.ts
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import axios from 'axios';
import {
  ALL_ESIGN_SECRETS, DEEPSIGN_API_BASE, REGION,
  getDeepSignAccessToken,
  deepsignClientId, deepsignClientSecret,
  deepsignServiceUsername, deepsignServicePassword,
} from './shared';
import { EsignCollection } from '@bk2/shared-models';

export const esignGetDocumentDetails = onCall<{ esignId: string }>(
  { region: REGION, enforceAppCheck: true, secrets: ALL_ESIGN_SECRETS },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required');

    const { esignId } = request.data;
    if (!esignId) throw new HttpsError('invalid-argument', 'esignId required');

    const db = getFirestore();
    const snap = await db.collection(EsignCollection).doc(esignId).get();
    if (!snap.exists) throw new HttpsError('not-found', 'Signing process not found');

    const record = snap.data() as { deepsignDocumentId: string; tenantId: string };
    const token = await getDeepSignAccessToken(
      deepsignClientId.value(), deepsignClientSecret.value(),
      deepsignServiceUsername.value(), deepsignServicePassword.value(),
    );

    const response = await axios.get(
      `${DEEPSIGN_API_BASE}/documents/${record.deepsignDocumentId}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );

    return { ...response.data, previewUrl: response.data.documentUrl };
  },
);
```

- [ ] **Step 2: Implement esignResendInvitation**

```typescript
// apps/functions/src/esign/esign-resend-invitation.ts
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import axios from 'axios';
import {
  ALL_ESIGN_SECRETS, DEEPSIGN_API_BASE, REGION,
  getDeepSignAccessToken,
  deepsignClientId, deepsignClientSecret,
  deepsignServiceUsername, deepsignServicePassword,
} from './shared';
import { EsignCollection } from '@bk2/shared-models';

export const esignResendInvitation = onCall<{ esignId: string; signeeId: string }>(
  { region: REGION, enforceAppCheck: true, secrets: ALL_ESIGN_SECRETS },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required');

    const { esignId, signeeId } = request.data;
    if (!esignId || !signeeId) throw new HttpsError('invalid-argument', 'esignId and signeeId required');

    const db = getFirestore();
    const snap = await db.collection(EsignCollection).doc(esignId).get();
    if (!snap.exists) throw new HttpsError('not-found', 'Signing process not found');

    const record = snap.data() as { deepsignDocumentId: string };
    const token = await getDeepSignAccessToken(
      deepsignClientId.value(), deepsignClientSecret.value(),
      deepsignServiceUsername.value(), deepsignServicePassword.value(),
    );

    await axios.post(
      `${DEEPSIGN_API_BASE}/documents/${record.deepsignDocumentId}/signees/${signeeId}/resend-invitation`,
      {},
      { headers: { Authorization: `Bearer ${token}` } },
    );

    return { success: true };
  },
);
```

- [ ] **Step 3: Commit**

```bash
git add apps/functions/src/esign/esign-get-document-details.ts apps/functions/src/esign/esign-resend-invitation.ts
git commit -m "feat(esign): CF esignGetDocumentDetails + esignResendInvitation"
```

---

### Task 6: CF esignDelete

**Files:**
- Create: `apps/functions/src/esign/esign-delete.ts`

- [ ] **Step 1: Implement esignDelete with all status branches and audit log**

```typescript
// apps/functions/src/esign/esign-delete.ts
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import axios from 'axios';
import {
  ALL_ESIGN_SECRETS, DEEPSIGN_API_BASE, REGION,
  getDeepSignAccessToken,
  deepsignClientId, deepsignClientSecret,
  deepsignServiceUsername, deepsignServicePassword,
} from './shared';
import { EsignCollection, EsignAuditCollection, EsignDocumentStatus } from '@bk2/shared-models';

export const esignDelete = onCall<{ esignId: string; reason?: string }>(
  { region: REGION, enforceAppCheck: true, secrets: ALL_ESIGN_SECRETS },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required');

    const { esignId, reason } = request.data;
    if (!esignId) throw new HttpsError('invalid-argument', 'esignId required');

    const db = getFirestore();
    const docRef = db.collection(EsignCollection).doc(esignId);
    const snap = await docRef.get();
    if (!snap.exists) throw new HttpsError('not-found', 'Signing process not found');

    const record = snap.data() as {
      deepsignDocumentId: string;
      documentStatus: EsignDocumentStatus;
      storagePath: string;
      signedPdfPath?: string;
      tenantId: string;
    };

    const status = record.documentStatus;
    let token: string | null = null;

    const needsToken = !['uploading', 'error'].includes(status);
    if (needsToken) {
      token = await getDeepSignAccessToken(
        deepsignClientId.value(), deepsignClientSecret.value(),
        deepsignServiceUsername.value(), deepsignServicePassword.value(),
      );
    }

    // Status-dependent cleanup on DeepSign side
    if (status === 'in-progress' && token) {
      // Withdraw first, then poll once to confirm
      await axios.put(
        `${DEEPSIGN_API_BASE}/documents/${record.deepsignDocumentId}/withdraw`,
        {},
        { headers: { Authorization: `Bearer ${token}` } },
      );
      await axios.get(
        `${DEEPSIGN_API_BASE}/documents/${record.deepsignDocumentId}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
    }

    if (!['uploading', 'error'].includes(status) && token) {
      try {
        await axios.delete(
          `${DEEPSIGN_API_BASE}/documents/${record.deepsignDocumentId}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
      } catch (err) {
        logger.warn('esignDelete: DeepSign DELETE failed (best-effort)', { esignId, err });
      }
    }

    // Delete Storage objects
    const bucket = getStorage().bucket();
    const deleteStorageFile = async (path: string) => {
      try { await bucket.file(path).delete(); } catch { /* ignore if not found */ }
    };

    await deleteStorageFile(record.storagePath);
    if (record.signedPdfPath) await deleteStorageFile(record.signedPdfPath);

    // Write audit log + delete esignList record in one transaction
    await db.runTransaction(async (tx) => {
      const auditRef = db
        .collection(EsignAuditCollection)
        .doc(record.tenantId)
        .collection('deletions')
        .doc(esignId);
      tx.set(auditRef, {
        esignId,
        deletedBy: request.auth!.uid,
        deletedAt: Timestamp.now(),
        priorStatus: status,
        ...(reason ? { reason } : {}),
      });
      tx.delete(docRef);
    });

    logger.info('esignDelete: deleted', { esignId, priorStatus: status });
    return { success: true };
  },
);
```

- [ ] **Step 2: Commit**

```bash
git add apps/functions/src/esign/esign-delete.ts
git commit -m "feat(esign): CF esignDelete — withdraw, delete, audit log"
```

---

### Task 7: CF esignSendByEmail

**Files:**
- Create: `apps/functions/src/esign/esign-send-by-email.ts`

- [ ] **Step 1: Implement esignSendByEmail**

```typescript
// apps/functions/src/esign/esign-send-by-email.ts
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import axios from 'axios';
import { defineSecret } from 'firebase-functions/params';
import { sendEmailViaProvider } from '../auth/email-transport';
import {
  ALL_ESIGN_SECRETS, DEEPSIGN_API_BASE, REGION,
  getDeepSignAccessToken,
  deepsignClientId, deepsignClientSecret,
  deepsignServiceUsername, deepsignServicePassword,
} from './shared';
import { EsignCollection } from '@bk2/shared-models';

const emailProvider = defineSecret('EMAIL_PROVIDER');
const emailFrom = defineSecret('EMAIL_FROM');

export const esignSendByEmail = onCall<{
  esignId: string;
  recipients: string[];
  subject?: string;
  body?: string;
  includeSignedPdf: boolean;
}>(
  {
    region: REGION,
    enforceAppCheck: true,
    secrets: [...ALL_ESIGN_SECRETS, emailProvider, emailFrom],
  },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required');

    const { esignId, recipients, subject, body, includeSignedPdf } = request.data;
    if (!esignId || !recipients?.length) {
      throw new HttpsError('invalid-argument', 'esignId and recipients required');
    }

    const db = getFirestore();
    const snap = await db.collection(EsignCollection).doc(esignId).get();
    if (!snap.exists) throw new HttpsError('not-found', 'Signing process not found');
    const record = snap.data() as { deepsignDocumentId: string; documentName: string };

    let pdfBuffer: Buffer | undefined;
    if (includeSignedPdf) {
      const token = await getDeepSignAccessToken(
        deepsignClientId.value(), deepsignClientSecret.value(),
        deepsignServiceUsername.value(), deepsignServicePassword.value(),
      );
      const detailsResponse = await axios.get(
        `${DEEPSIGN_API_BASE}/documents/${record.deepsignDocumentId}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const documentUrl: string = detailsResponse.data.documentUrl;
      const pdfResponse = await axios.get<ArrayBuffer>(documentUrl, { responseType: 'arraybuffer' });
      pdfBuffer = Buffer.from(pdfResponse.data);
    }

    const emailHtml = body ?? `<p>Bitte finden Sie das Dokument <strong>${record.documentName}</strong> im Anhang.</p>`;

    await sendEmailViaProvider(emailProvider.value(), {
      from: emailFrom.value(),
      to: recipients,
      subject: subject ?? `Dokument: ${record.documentName}`,
      html: emailHtml,
    });

    await db.collection(EsignCollection).doc(esignId).update({
      [`sendLog`]: FieldValue.arrayUnion({
        sentAt: Timestamp.now(),
        sentBy: request.auth.uid,
        recipients,
      }),
      updatedAt: FieldValue.serverTimestamp(),
    });

    logger.info('esignSendByEmail: sent', { esignId, recipients });
    return { success: true };
  },
);
```

- [ ] **Step 2: Commit**

```bash
git add apps/functions/src/esign/esign-send-by-email.ts
git commit -m "feat(esign): CF esignSendByEmail"
```

---

### Task 8: CF esignWebhook

**Files:**
- Create: `apps/functions/src/esign/esign-webhook.ts`

- [ ] **Step 1: Implement esignWebhook HTTP handler**

```typescript
// apps/functions/src/esign/esign-webhook.ts
import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { webhookSecret, REGION, verifyWebhookToken } from './shared';
import { EsignCollection, EsignDocumentStatus, EsignSignStatus } from '@bk2/shared-models';

const TERMINAL_STATUSES: EsignDocumentStatus[] = ['signed', 'rejected', 'withdrawn'];

export const esignWebhook = onRequest(
  { region: REGION, secrets: [webhookSecret] },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    const esignId = req.query['esignId'] as string | undefined;
    const token = req.query['token'] as string | undefined;

    if (!esignId || !token) {
      res.status(400).send('Missing esignId or token');
      return;
    }

    if (!verifyWebhookToken(esignId, token, webhookSecret.value())) {
      logger.warn('esignWebhook: invalid token', { esignId });
      res.status(401).send('Unauthorized');
      return;
    }

    const payload = req.body as {
      documentId?: string;
      documentStatus?: string;
      signStatus?: string;
      signeeId?: string;
      viewedTime?: string;
      signedTime?: string;
      completionTime?: string;
      signeeComment?: string;
    };

    const db = getFirestore();
    const docRef = db.collection(EsignCollection).doc(esignId);
    const snap = await docRef.get();

    if (!snap.exists) {
      logger.warn('esignWebhook: unknown esignId', { esignId });
      res.status(200).send('OK'); // ignore unknown, return 200 so DeepSign doesn't retry
      return;
    }

    const record = snap.data() as { documentStatus: EsignDocumentStatus };
    const newDocStatus = payload.documentStatus as EsignDocumentStatus | undefined;

    // Idempotency: ignore if status hasn't changed and is already terminal
    if (
      TERMINAL_STATUSES.includes(record.documentStatus) &&
      newDocStatus === record.documentStatus
    ) {
      res.status(200).send('OK');
      return;
    }

    const now = Timestamp.now();
    const update: Record<string, unknown> = {
      updatedAt: FieldValue.serverTimestamp(),
      events: FieldValue.arrayUnion({ type: newDocStatus, at: now, payload }),
    };

    if (newDocStatus) update['documentStatus'] = newDocStatus;
    if (payload.signStatus) update['signStatus'] = payload.signStatus as EsignSignStatus;

    // Update matching signee entry
    if (payload.signeeId) {
      const currentSignees: unknown[] = snap.data()?.['signees'] ?? [];
      const updatedSignees = (currentSignees as Array<Record<string, unknown>>).map(s => {
        if (s['signeeId'] !== payload.signeeId) return s;
        return {
          ...s,
          ...(payload.signStatus ? { signStatus: payload.signStatus } : {}),
          ...(payload.viewedTime ? { viewedTime: Timestamp.fromDate(new Date(payload.viewedTime)) } : {}),
          ...(payload.signedTime ? { signedTime: Timestamp.fromDate(new Date(payload.signedTime)) } : {}),
          ...(payload.completionTime ? { completionTime: Timestamp.fromDate(new Date(payload.completionTime)) } : {}),
          ...(payload.signeeComment ? { signeeComment: payload.signeeComment } : {}),
        };
      });
      update['signees'] = updatedSignees;
    }

    // Set completionTime if terminal
    if (newDocStatus && TERMINAL_STATUSES.includes(newDocStatus)) {
      update['completionTime'] = now;
    }

    await docRef.update(update);
    logger.info('esignWebhook: updated', { esignId, newDocStatus });
    res.status(200).send('OK');
  },
);
```

- [ ] **Step 2: Commit**

```bash
git add apps/functions/src/esign/esign-webhook.ts
git commit -m "feat(esign): CF esignWebhook — HMAC verification + idempotent Firestore update"
```

---

### Task 9: CF esignArchiveSigned

**Files:**
- Create: `apps/functions/src/esign/esign-archive-signed.ts`

- [ ] **Step 1: Implement Firestore trigger for archiving signed PDFs**

```typescript
// apps/functions/src/esign/esign-archive-signed.ts
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import axios from 'axios';
import {
  ALL_ESIGN_SECRETS, DEEPSIGN_API_BASE, REGION,
  getDeepSignAccessToken,
  deepsignClientId, deepsignClientSecret,
  deepsignServiceUsername, deepsignServicePassword,
} from './shared';
import { EsignCollection } from '@bk2/shared-models';

export const esignArchiveSigned = onDocumentUpdated(
  { document: `${EsignCollection}/{esignId}`, region: REGION, secrets: ALL_ESIGN_SECRETS },
  async (event) => {
    const before = event.data?.before?.data() as { documentStatus: string } | undefined;
    const after = event.data?.after?.data() as {
      documentStatus: string;
      deepsignDocumentId: string;
      tenantId: string;
      signedPdfPath?: string;
    } | undefined;

    // Only trigger on transition to 'signed'
    if (!after || after.documentStatus !== 'signed') return;
    if (before?.documentStatus === 'signed') return; // already processed
    if (after.signedPdfPath) return; // already archived

    const { esignId } = event.params;

    try {
      const token = await getDeepSignAccessToken(
        deepsignClientId.value(), deepsignClientSecret.value(),
        deepsignServiceUsername.value(), deepsignServicePassword.value(),
      );

      const detailsResponse = await axios.get(
        `${DEEPSIGN_API_BASE}/documents/${after.deepsignDocumentId}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );

      const documentUrl: string = detailsResponse.data.documentUrl;
      const pdfResponse = await axios.get<ArrayBuffer>(documentUrl, { responseType: 'arraybuffer' });
      const buffer = Buffer.from(pdfResponse.data);

      const signedPdfPath = `tenants/${after.tenantId}/esign/${esignId}/signed.pdf`;
      await getStorage().bucket().file(signedPdfPath).save(buffer, {
        metadata: { contentType: 'application/pdf' },
      });

      await getFirestore().collection(EsignCollection).doc(esignId).update({
        signedPdfPath,
        updatedAt: FieldValue.serverTimestamp(),
      });

      logger.info('esignArchiveSigned: archived', { esignId, signedPdfPath });
    } catch (err) {
      logger.error('esignArchiveSigned: failed to archive', { esignId, err });
    }
  },
);
```

- [ ] **Step 2: Commit**

```bash
git add apps/functions/src/esign/esign-archive-signed.ts
git commit -m "feat(esign): CF esignArchiveSigned — Firestore trigger archives signed PDF to Storage"
```

---

### Task 10: CF index.ts + main.ts exports + build verification

**Files:**
- Create: `apps/functions/src/esign/index.ts`
- Modify: `apps/functions/src/main.ts`

- [ ] **Step 1: Create index.ts**

```typescript
// apps/functions/src/esign/index.ts
export { esignScanPredefined } from './esign-scan-predefined';
export { esignSendDocument } from './esign-send-document';
export type { EsignSendDocumentRequest } from './esign-send-document';
export { esignGetDocumentDetails } from './esign-get-document-details';
export { esignResendInvitation } from './esign-resend-invitation';
export { esignDelete } from './esign-delete';
export { esignSendByEmail } from './esign-send-by-email';
export { esignWebhook } from './esign-webhook';
export { esignArchiveSigned } from './esign-archive-signed';
```

- [ ] **Step 2: Add to main.ts**

In `apps/functions/src/main.ts`, after the existing imports add:

```typescript
import * as Esign from './esign';
```

After the existing exports, add:

```typescript
// esign (DeepSign integration)
export const esignScanPredefined     = Esign.esignScanPredefined;
export const esignSendDocument       = Esign.esignSendDocument;
export const esignGetDocumentDetails = Esign.esignGetDocumentDetails;
export const esignResendInvitation   = Esign.esignResendInvitation;
export const esignDelete             = Esign.esignDelete;
export const esignSendByEmail        = Esign.esignSendByEmail;
export const esignWebhook            = Esign.esignWebhook;
export const esignArchiveSigned      = Esign.esignArchiveSigned;
```

- [ ] **Step 3: Build functions to verify**

```bash
pnpm nx build functions --configuration production 2>&1 | tail -20
```

Expected: build succeeds with no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add apps/functions/src/esign/index.ts apps/functions/src/main.ts
git commit -m "feat(esign): wire CF exports to main.ts, verify build"
```

---

### Task 11: Firestore security rules

**Files:**
- Modify: `firestore.rules`

- [ ] **Step 1: Add esign rules**

In `firestore.rules`, before the closing `match /{document=**}` wildcard rule, add:

```
    // esignList: clients read only, CFs write
    match /esignList/{esignId} {
      allow read: if request.auth != null
                  && request.auth.token.tenantId == resource.data.tenantId;
      allow write: if false;
    }

    // esignAudit: no client access (CF-only via Admin SDK)
    match /esignAudit/{tenantId}/{collection=**} {
      allow read, write: if false;
    }
```

- [ ] **Step 2: Commit**

```bash
git add firestore.rules
git commit -m "feat(esign): Firestore security rules for esignList and esignAudit"
```

---

### Task 12: Client lib scaffolding

**Files:**
- Create: all tsconfig, package.json, project.json, index.ts files for `libs/esign/data-access/` and `libs/esign/feature/`
- Modify: `tsconfig.base.json`

- [ ] **Step 1: Create data-access lib files**

`libs/esign/data-access/tsconfig.json`:
```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true,
    "types": ["node", "vitest"],
    "declaration": true
  },
  "angularCompilerOptions": {
    "strictTemplates": true,
    "strictInjectionParameters": true,
    "fullTemplateTypeCheck": true,
    "disableTypeScriptVersionCheck": true,
    "compileNonExportedClasses": true,
    "skipTemplateCodegen": false
  },
  "include": ["src/**/*", "**/*.spec.ts", "**/*.test.ts"],
  "exclude": ["dist/**/*"],
  "references": [
    { "path": "../../shared/config/tsconfig.lib.json" },
    { "path": "../../shared/data-access/tsconfig.lib.json" },
    { "path": "../../shared/i18n/tsconfig.lib.json" },
    { "path": "../../shared/models/tsconfig.lib.json" },
    { "path": "../../shared/util-angular/tsconfig.lib.json" },
    { "path": "../../shared/util-core/tsconfig.lib.json" }
  ]
}
```

`libs/esign/data-access/tsconfig.lib.json`:
```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "../../../dist/libs/esign/data-access",
    "declaration": true,
    "composite": true,
    "module": "es2020",
    "target": "es2020",
    "types": [],
    "tsBuildInfoFile": "../../../dist/out-tsc/esign-data-access.tsbuildinfo"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["**/*.spec.ts", "**/*.spec2.ts", "**/test-setup.ts", "vite.config.ts"],
  "references": []
}
```

`libs/esign/data-access/package.json`:
```json
{
  "name": "@bk2/esign-data-access",
  "version": "0.0.1",
  "main": "./src/index.js",
  "types": "./src/index.d.ts",
  "sideEffects": false,
  "private": true,
  "dependencies": {
    "tslib": "^2.8.1",
    "@bk2/shared-config": "*",
    "@bk2/shared-data-access": "*",
    "@bk2/shared-i18n": "*",
    "@bk2/shared-models": "*",
    "@bk2/shared-util-angular": "*",
    "@bk2/shared-util-core": "*"
  }
}
```

`libs/esign/data-access/project.json`:
```json
{
  "name": "esign-data-access",
  "$schema": "../../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "libs/esign/data-access/src",
  "prefix": "bk",
  "projectType": "library",
  "tags": ["type:data-access", "scope:esign", "platform:mobile", "platform:web"],
  "targets": {
    "build": {
      "executor": "@nx/js:tsc",
      "outputs": ["{options.outputPath}"],
      "options": {
        "outputPath": "dist/libs/esign/data-access",
        "main": "libs/esign/data-access/src/index.ts",
        "tsConfig": "libs/esign/data-access/tsconfig.lib.json",
        "assets": [],
        "updateBuildableProjectDepsInPackageJson": false
      }
    },
    "lint": { "executor": "@nx/eslint:lint" }
  }
}
```

`libs/esign/data-access/src/index.ts`:
```typescript
export * from './lib/esign.service';
```

- [ ] **Step 2: Create feature lib files**

`libs/esign/feature/tsconfig.json`:
```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true,
    "types": ["node", "vitest"],
    "declaration": true
  },
  "angularCompilerOptions": {
    "strictTemplates": true,
    "strictInjectionParameters": true,
    "fullTemplateTypeCheck": true,
    "disableTypeScriptVersionCheck": true,
    "compileNonExportedClasses": true,
    "skipTemplateCodegen": false
  },
  "include": ["src/**/*", "**/*.spec.ts", "**/*.test.ts"],
  "exclude": ["dist/**/*"],
  "references": [
    { "path": "../../shared/config/tsconfig.lib.json" },
    { "path": "../../shared/data-access/tsconfig.lib.json" },
    { "path": "../../shared/feature/tsconfig.lib.json" },
    { "path": "../../shared/i18n/tsconfig.lib.json" },
    { "path": "../../shared/models/tsconfig.lib.json" },
    { "path": "../../shared/pipes/tsconfig.lib.json" },
    { "path": "../../shared/ui/tsconfig.lib.json" },
    { "path": "../../shared/util-angular/tsconfig.lib.json" },
    { "path": "../../shared/util-core/tsconfig.lib.json" },
    { "path": "../data-access/tsconfig.lib.json" }
  ]
}
```

`libs/esign/feature/tsconfig.lib.json`:
```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "../../../dist/libs/esign/feature",
    "declaration": true,
    "composite": true,
    "module": "es2020",
    "target": "es2020",
    "types": [],
    "tsBuildInfoFile": "../../../dist/out-tsc/esign-feature.tsbuildinfo"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["**/*.spec.ts", "**/*.spec2.ts", "**/test-setup.ts", "vite.config.ts"],
  "references": [
    { "path": "../data-access/tsconfig.lib.json" }
  ]
}
```

`libs/esign/feature/package.json`:
```json
{
  "name": "@bk2/esign-feature",
  "version": "0.0.1",
  "main": "./src/index.js",
  "types": "./src/index.d.ts",
  "sideEffects": false,
  "private": true,
  "dependencies": {
    "tslib": "^2.8.1",
    "@bk2/shared-config": "*",
    "@bk2/shared-data-access": "*",
    "@bk2/shared-feature": "*",
    "@bk2/shared-i18n": "*",
    "@bk2/shared-models": "*",
    "@bk2/shared-pipes": "*",
    "@bk2/shared-ui": "*",
    "@bk2/shared-util-angular": "*",
    "@bk2/shared-util-core": "*",
    "@bk2/esign-data-access": "*"
  }
}
```

`libs/esign/feature/project.json`:
```json
{
  "name": "esign-feature",
  "$schema": "../../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "libs/esign/feature/src",
  "prefix": "bk",
  "projectType": "library",
  "tags": ["type:feature", "scope:esign", "platform:mobile", "platform:web"],
  "targets": {
    "build": {
      "executor": "@nx/js:tsc",
      "outputs": ["{options.outputPath}"],
      "options": {
        "outputPath": "dist/libs/esign/feature",
        "main": "libs/esign/feature/src/index.ts",
        "tsConfig": "libs/esign/feature/tsconfig.lib.json",
        "assets": ["libs/esign/feature/*.md"],
        "updateBuildableProjectDepsInPackageJson": false
      }
    },
    "lint": { "executor": "@nx/eslint:lint" }
  }
}
```

`libs/esign/feature/src/index.ts`:
```typescript
export * from './lib/esign.store';
export * from './lib/esign-list';
export * from './lib/esign-view.modal';
export * from './lib/esign-delete-confirm.modal';
```

- [ ] **Step 3: Add import aliases to tsconfig.base.json**

In `tsconfig.base.json`, find the `paths` section and add (keep alphabetical order near `document` entries):

```json
"@bk2/esign-data-access": ["libs/esign/data-access/src/index.ts"],
"@bk2/esign-feature": ["libs/esign/feature/src/index.ts"],
```

- [ ] **Step 4: Commit**

```bash
git add libs/esign/ tsconfig.base.json
git commit -m "feat(esign): scaffold esign data-access and feature lib structure"
```

---

### Task 13: EsignService (data-access)

**Files:**
- Create: `libs/esign/data-access/src/lib/esign.service.ts`

- [ ] **Step 1: Implement EsignService**

```typescript
// libs/esign/data-access/src/lib/esign.service.ts
import { Injectable, inject, isDevMode } from '@angular/core';
import { Observable } from 'rxjs';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { getApp } from 'firebase/app';
import { collectionData, docData } from 'rxfire/firestore';
import { collection, doc, orderBy, query, where } from 'firebase/firestore';

import { ENV, FIRESTORE } from '@bk2/shared-config';
import { EsignCollection, EsignRecord } from '@bk2/shared-models';

export interface EsignSendRequest {
  storagePath: string;
  documentName?: string;
  initiatorAliasName: string;
  comment?: string;
  signatureMode?: 'timestamp' | 'advanced' | 'qualified';
  jurisdiction?: 'zertes' | 'eidas';
  sendMail?: 'all' | 'others' | 'none';
  source: 'user-upload' | 'cf-generated';
  sourceRef?: string;
}

export interface EsignSendResponse {
  esignId: string;
  documentId: string;
  signees: unknown[];
}

@Injectable({ providedIn: 'root' })
export class EsignService {
  private readonly env = inject(ENV);
  private readonly firestore = inject(FIRESTORE);

  private get functions() {
    const fns = getFunctions(getApp(), 'europe-west6');
    if (isDevMode()) {
      try { connectFunctionsEmulator(fns, 'localhost', 5001); } catch { /* already connected */ }
    }
    return fns;
  }

  public list(): Observable<EsignRecord[]> {
    const q = query(
      collection(this.firestore, EsignCollection),
      where('tenantId', '==', this.env.tenantId),
      orderBy('createdAt', 'desc'),
    );
    return collectionData(q, { idField: 'esignId' }) as Observable<EsignRecord[]>;
  }

  public read(esignId: string): Observable<EsignRecord | undefined> {
    const ref = doc(this.firestore, EsignCollection, esignId);
    return docData(ref, { idField: 'esignId' }) as Observable<EsignRecord | undefined>;
  }

  public async scanPredefined(storagePath: string): Promise<unknown> {
    const fn = httpsCallable(this.functions, 'esignScanPredefined');
    const result = await fn({ storagePath });
    return result.data;
  }

  public async sendDocument(req: EsignSendRequest): Promise<EsignSendResponse> {
    const fn = httpsCallable<EsignSendRequest, EsignSendResponse>(this.functions, 'esignSendDocument');
    const result = await fn(req);
    return result.data;
  }

  public async getDocumentDetails(esignId: string): Promise<unknown> {
    const fn = httpsCallable(this.functions, 'esignGetDocumentDetails');
    const result = await fn({ esignId });
    return result.data;
  }

  public async resendInvitation(esignId: string, signeeId: string): Promise<void> {
    const fn = httpsCallable(this.functions, 'esignResendInvitation');
    await fn({ esignId, signeeId });
  }

  public async deleteProcess(esignId: string, reason?: string): Promise<void> {
    const fn = httpsCallable(this.functions, 'esignDelete');
    await fn({ esignId, reason });
  }

  public async sendByEmail(
    esignId: string,
    recipients: string[],
    includeSignedPdf: boolean,
    subject?: string,
    body?: string,
  ): Promise<void> {
    const fn = httpsCallable(this.functions, 'esignSendByEmail');
    await fn({ esignId, recipients, subject, body, includeSignedPdf });
  }

  public async uploadStagingPdf(file: File, tenantId: string): Promise<string> {
    const { ref, uploadBytes } = await import('firebase/storage');
    const { getStorage } = await import('firebase/storage');
    const { randomUUID } = await import('crypto');
    const uuid = crypto.randomUUID();
    const storagePath = `tenants/${tenantId}/esign/staging/${uuid}.pdf`;
    const storageRef = ref(getStorage(), storagePath);
    await uploadBytes(storageRef, file, { contentType: 'application/pdf' });
    return storagePath;
  }
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit -p libs/esign/data-access/tsconfig.json
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add libs/esign/data-access/src/lib/esign.service.ts
git commit -m "feat(esign): EsignService — Firestore list/read + CF callable wrappers"
```

---

### Task 14: EsignStore

**Files:**
- Create: `libs/esign/feature/src/lib/esign.store.ts`

- [ ] **Step 1: Implement EsignStore**

```typescript
// libs/esign/feature/src/lib/esign.store.ts
import { inject, computed } from '@angular/core';
import { signalStore, withState, withComputed, withMethods, withProps } from '@ngrx/signals';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController } from '@ionic/angular/standalone';

import { AppStore } from '@bk2/shared-feature';
import { I18nService } from '@bk2/shared-i18n';
import { EsignRecord, EsignDocumentStatus } from '@bk2/shared-models';
import { error } from '@bk2/shared-util-angular';

import { EsignService } from '@bk2/esign-data-access';

const ESIGN_I18N_KEYS = {
  list_title: '@esign/list.title',
  send_conf: '@esign/send.conf',
  send_error: '@esign/send.error',
  delete_conf: '@esign/delete.conf',
  delete_error: '@esign/delete.error',
  email_conf: '@esign/email.conf',
  email_error: '@esign/email.error',
  cancel: '@esign/cancel',
} satisfies Record<string, string>;

export type EsignI18n = { [K in keyof typeof ESIGN_I18N_KEYS]: import('@angular/core').Signal<string> };

export const EsignStore = signalStore(
  withState({
    searchTerm: '',
    statusFilter: 'all' as string,
  }),
  withProps(() => ({
    appStore: inject(AppStore),
    esignService: inject(EsignService),
    modalController: inject(ModalController),
    i18nService: inject(I18nService),
  })),
  withProps(store => ({
    i18n: store.i18nService.translateAll(ESIGN_I18N_KEYS) as EsignI18n,
    esignResource: rxResource({
      params: () => ({ tenantId: store.appStore.tenantId() }),
      stream: () => store.esignService.list(),
    }),
  })),
  withComputed(store => ({
    filteredRecords: computed(() => {
      const all = store.esignResource.value() ?? [];
      const term = store.searchTerm().toLowerCase();
      const filter = store.statusFilter();
      return all
        .filter(r => filter === 'all' || r.documentStatus === filter)
        .filter(r => !term || r.documentName.toLowerCase().includes(term));
    }),
  })),
  withMethods(store => ({
    setSearchTerm(term: string): void {
      store.searchTerm.set(term);
    },
    setStatusFilter(status: string): void {
      store.statusFilter.set(status);
    },
    async openDeleteConfirm(record: EsignRecord): Promise<void> {
      const { EsignDeleteConfirmModal } = await import('./esign-delete-confirm.modal');
      const modal = await store.modalController.create({
        component: EsignDeleteConfirmModal,
        componentProps: { record },
      });
      await modal.present();
      const { data } = await modal.onDidDismiss<{ confirmed: boolean; reason?: string }>();
      if (!data?.confirmed) return;
      try {
        await store.esignService.deleteProcess(record.esignId, data.reason);
      } catch (e) {
        error(store.i18n.delete_error());
      }
    },
    async openViewModal(record: EsignRecord): Promise<void> {
      const { EsignViewModal } = await import('./esign-view.modal');
      const modal = await store.modalController.create({
        component: EsignViewModal,
        componentProps: { esignId: record.esignId },
        cssClass: 'full-screen-modal',
      });
      await modal.present();
    },
  })),
);
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit -p libs/esign/feature/tsconfig.json
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add libs/esign/feature/src/lib/esign.store.ts
git commit -m "feat(esign): EsignStore — rxResource, filter, delete + view modal dispatch"
```

---

### Task 15: EsignListPage

**Files:**
- Create: `libs/esign/feature/src/lib/esign-list.ts`

- [ ] **Step 1: Implement EsignListPage**

```typescript
// libs/esign/feature/src/lib/esign-list.ts
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActionSheetController, ActionSheetOptions } from '@ionic/angular/standalone';
import {
  IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon,
  IonContent, IonList, IonItem, IonLabel, IonChip, IonNote,
  IonMenuButton, IonThumbnail,
} from '@ionic/angular/standalone';

import { EsignRecord, EsignDocumentStatus } from '@bk2/shared-models';
import { SvgIconPipe, PrettyDatePipe } from '@bk2/shared-pipes';
import { EmptyList, ListFilter, Spinner } from '@bk2/shared-ui';
import { createActionSheetButton, createActionSheetOptions, error } from '@bk2/shared-util-angular';
import { AppStore } from '@bk2/shared-feature';
import { EsignService } from '@bk2/esign-data-access';

import { EsignStore } from './esign.store';

const STATUS_COLORS: Record<EsignDocumentStatus, string> = {
  uploading: 'primary',
  draft: 'medium',
  'in-progress': 'warning',
  signed: 'success',
  withdrawn: 'medium',
  rejected: 'danger',
  error: 'danger',
};

@Component({
  selector: 'bk-esign-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [EsignStore],
  imports: [
    SvgIconPipe, PrettyDatePipe,
    Spinner, ListFilter, EmptyList,
    IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon,
    IonContent, IonList, IonItem, IonLabel, IonChip, IonNote,
    IonMenuButton, IonThumbnail,
  ],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
        <ion-title>{{ store.filteredRecords().length }} {{ store.i18n.list_title() }}</ion-title>
        <ion-buttons slot="end">
          <ion-button fill="clear" (click)="openSendFlow()">
            <ion-icon src="{{ 'add-circle' | svgIcon }}" slot="icon-only" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
      <bk-list-filter (searchTermChanged)="store.setSearchTerm($event)" />
    </ion-header>

    <ion-content>
      @if(store.esignResource.isLoading()) {
        <bk-spinner />
      } @else if(store.filteredRecords().length === 0) {
        <bk-empty-list message="@esign/list.empty" />
      } @else {
        <ion-list>
          @for(record of store.filteredRecords(); track record.esignId) {
            <ion-item button (click)="showActions(record)">
              <ion-thumbnail slot="start">
                <ion-icon src="{{ 'document' | svgIcon }}" [color]="statusColor(record.documentStatus)" />
              </ion-thumbnail>
              <ion-label>
                <h2>{{ record.documentName }}</h2>
                <p>
                  {{ signedCount(record) }}/{{ record.signees.length }} signiert ·
                  {{ record.createdAt | prettyDate }}
                </p>
              </ion-label>
              <ion-chip slot="end"
                [outline]="true"
                [color]="statusColor(record.documentStatus)">
                {{ record.documentStatus }}
              </ion-chip>
            </ion-item>
          }
        </ion-list>
      }
    </ion-content>
  `,
})
export class EsignList {
  protected readonly store = inject(EsignStore);
  private readonly esignService = inject(EsignService);
  private readonly appStore = inject(AppStore);
  private readonly actionSheetController = inject(ActionSheetController);

  private readonly imgixBaseUrl = this.appStore.env.services.imgixBaseUrl;

  protected statusColor(status: EsignDocumentStatus): string {
    return STATUS_COLORS[status] ?? 'medium';
  }

  protected signedCount(record: EsignRecord): number {
    return record.signees.filter(s => s.signStatus === 'signed').length;
  }

  protected async openSendFlow(): Promise<void> {
    // File picker → scan → confirm → send
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/pdf';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      if (file.size > 40 * 1024 * 1024) {
        error('@esign/error.file_too_large');
        return;
      }
      const tenantId = this.appStore.tenantId();
      const storagePath = await this.esignService.uploadStagingPdf(file, tenantId);
      const scan = await this.esignService.scanPredefined(storagePath) as {
        signatureFields?: unknown[];
      };
      if (!scan.signatureFields?.length) {
        error('@esign/error.no_signature_fields');
        return;
      }
      // TODO: show a send-options form sheet, then call store.send()
      await this.esignService.sendDocument({
        storagePath,
        documentName: file.name,
        initiatorAliasName: this.appStore.currentUser()?.name ?? '',
        source: 'user-upload',
      });
    };
    input.click();
  }

  protected async showActions(record: EsignRecord): Promise<void> {
    const opts: ActionSheetOptions = createActionSheetOptions(record.documentName);
    opts.buttons.push(
      createActionSheetButton('esign.status_view', '@esign/action.status_view', this.imgixBaseUrl, 'eye'),
      createActionSheetButton('document.view', '@esign/action.document_view', this.imgixBaseUrl, 'document'),
    );
    if (record.documentStatus === 'signed') {
      opts.buttons.push(
        createActionSheetButton('document.share', '@esign/action.document_share', this.imgixBaseUrl, 'share'),
        createActionSheetButton('document.send', '@esign/action.document_send', this.imgixBaseUrl, 'mail'),
      );
    }
    opts.buttons.push(
      createActionSheetButton('esign.delete', '@esign/action.esign_delete', this.imgixBaseUrl, 'trash'),
      createActionSheetButton('cancel', this.store.i18n.cancel(), this.imgixBaseUrl, 'cancel'),
    );

    const sheet = await this.actionSheetController.create(opts);
    await sheet.present();
    const { data } = await sheet.onDidDismiss();
    if (!data) return;
    switch (data.action) {
      case 'esign.status_view': await this.store.openViewModal(record); break;
      case 'document.view': window.open(record.signedPdfPath ?? '', '_blank'); break;
      case 'esign.delete': await this.store.openDeleteConfirm(record); break;
    }
  }
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit -p libs/esign/feature/tsconfig.json
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add libs/esign/feature/src/lib/esign-list.ts
git commit -m "feat(esign): EsignListPage — list, status chips, action sheet, send flow"
```

---

### Task 16: EsignViewModal

**Files:**
- Create: `libs/esign/feature/src/lib/esign-view.modal.ts`

- [ ] **Step 1: Implement EsignViewModal**

```typescript
// libs/esign/feature/src/lib/esign-view.modal.ts
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import {
  IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon,
  IonContent, IonGrid, IonRow, IonCol, IonLabel, IonChip, IonItem,
  IonList, IonNote, IonSpinner, ModalController,
} from '@ionic/angular/standalone';

import { EsignRecord, EsignSignee } from '@bk2/shared-models';
import { SvgIconPipe, PrettyDatePipe } from '@bk2/shared-pipes';
import { Spinner } from '@bk2/shared-ui';
import { EsignService } from '@bk2/esign-data-access';

@Component({
  selector: 'bk-esign-view-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    SvgIconPipe, PrettyDatePipe, Spinner,
    IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon,
    IonContent, IonGrid, IonRow, IonCol, IonLabel, IonChip, IonItem,
    IonList, IonNote, IonSpinner,
  ],
  styles: [`
    .preview-frame { width: 100%; height: 60vh; border: none; }
    .signee-row { display: flex; align-items: center; gap: 8px; padding: 8px 0; }
    .events-list { font-size: 0.8rem; color: var(--ion-color-medium); }
  `],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-title>{{ record()?.documentName }}</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="refresh()">
            <ion-icon src="{{ 'refresh' | svgIcon }}" slot="icon-only" />
          </ion-button>
          <ion-button (click)="close()">
            <ion-icon src="{{ 'close' | svgIcon }}" slot="icon-only" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      @if(loading()) {
        <bk-spinner />
      } @else if(record(); as rec) {
        <ion-grid>
          <ion-row>
            <!-- PDF preview column -->
            <ion-col size="12" size-md="7">
              @if(safePreviewUrl(); as url) {
                <iframe class="preview-frame" [src]="url" title="PDF Vorschau"></iframe>
              }
            </ion-col>

            <!-- Signing status column -->
            <ion-col size="12" size-md="5">
              <!-- Summary -->
              <ion-list>
                <ion-item>
                  <ion-label>
                    <p><strong>Initiator:</strong> {{ rec.initiatorAliasName }}</p>
                    <p><strong>Modus:</strong> {{ rec.signatureMode }} · {{ rec.jurisdiction }}</p>
                    <p><strong>Erstellt:</strong> {{ rec.createdAt | prettyDate }}</p>
                    @if(rec.startedAt) {
                      <p><strong>Gestartet:</strong> {{ rec.startedAt | prettyDate }}</p>
                    }
                    @if(rec.completionTime) {
                      <p><strong>Abgeschlossen:</strong> {{ rec.completionTime | prettyDate }}</p>
                    }
                  </ion-label>
                </ion-item>
              </ion-list>

              <!-- Signees -->
              <ion-list>
                @for(signee of rec.signees; track signee.signeeId) {
                  <ion-item>
                    <ion-label>
                      <h3>{{ signee.name ?? signee.email }}</h3>
                      <p>{{ signee.email }}</p>
                      @if(signee.viewedTime) { <p>Gesehen: {{ signee.viewedTime | prettyDate }}</p> }
                      @if(signee.signedTime) { <p>Signiert: {{ signee.signedTime | prettyDate }}</p> }
                      @if(signee.signeeComment) { <p>Kommentar: {{ signee.signeeComment }}</p> }
                    </ion-label>
                    <ion-chip slot="end" [color]="signeeChipColor(signee)">{{ signee.signStatus }}</ion-chip>
                    @if(signee.signStatus === 'pending' || signee.signStatus === 'on-hold') {
                      <ion-button slot="end" fill="clear" (click)="resendInvitation(signee.signeeId)">
                        <ion-icon src="{{ 'mail' | svgIcon }}" slot="icon-only" />
                      </ion-button>
                    }
                  </ion-item>
                }
              </ion-list>

              <!-- Footer actions -->
              @if(rec.documentStatus === 'signed') {
                <ion-button expand="block" fill="outline" (click)="downloadSigned()">
                  <ion-icon src="{{ 'download' | svgIcon }}" slot="start" />
                  Signiertes PDF herunterladen
                </ion-button>
              }
            </ion-col>
          </ion-row>
        </ion-grid>
      }
    </ion-content>
  `,
})
export class EsignViewModal {
  public readonly esignId = input.required<string>();

  private readonly esignService = inject(EsignService);
  private readonly modalController = inject(ModalController);
  private readonly sanitizer = inject(DomSanitizer);

  protected readonly record = signal<EsignRecord | undefined>(undefined);
  protected readonly loading = signal(true);
  protected readonly previewUrl = signal<string>('');
  protected readonly safePreviewUrl = computed<SafeResourceUrl | null>(() => {
    const url = this.previewUrl();
    return url ? this.sanitizer.bypassSecurityTrustResourceUrl(url) : null;
  });

  constructor() {
    effect(() => {
      const id = this.esignId();
      if (id) void this.loadDetails(id);
    }, { allowSignalWrites: true });
  }

  private async loadDetails(esignId: string): Promise<void> {
    this.loading.set(true);
    try {
      const details = await this.esignService.getDocumentDetails(esignId) as EsignRecord & { previewUrl: string };
      this.record.set(details);
      this.previewUrl.set(details.previewUrl ?? '');
    } finally {
      this.loading.set(false);
    }
  }

  protected async refresh(): Promise<void> {
    await this.loadDetails(this.esignId());
  }

  protected async resendInvitation(signeeId: string): Promise<void> {
    await this.esignService.resendInvitation(this.esignId(), signeeId);
  }

  protected downloadSigned(): void {
    const path = this.record()?.signedPdfPath;
    if (path) window.open(path, '_blank');
  }

  protected async close(): Promise<void> {
    await this.modalController.dismiss();
  }

  protected signeeChipColor(signee: EsignSignee): string {
    switch (signee.signStatus) {
      case 'signed': return 'success';
      case 'rejected': return 'danger';
      case 'in-progress': return 'primary';
      default: return 'warning';
    }
  }
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit -p libs/esign/feature/tsconfig.json
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add libs/esign/feature/src/lib/esign-view.modal.ts
git commit -m "feat(esign): EsignViewModal — PDF iframe, signees timeline, refresh"
```

---

### Task 17: EsignDeleteConfirmModal

**Files:**
- Create: `libs/esign/feature/src/lib/esign-delete-confirm.modal.ts`

- [ ] **Step 1: Implement the status-adaptive delete confirm dialog**

```typescript
// libs/esign/feature/src/lib/esign-delete-confirm.modal.ts
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonHeader, IonToolbar, IonTitle, IonButtons, IonButton,
  IonContent, IonItem, IonLabel, IonTextarea, ModalController,
} from '@ionic/angular/standalone';

import { EsignRecord, EsignDocumentStatus } from '@bk2/shared-models';

interface DeleteConfig {
  title: string;
  body: string;
  confirmLabel: string;
  showDownload: boolean;
}

const DELETE_CONFIG: Record<EsignDocumentStatus, DeleteConfig> = {
  uploading: {
    title: 'Upload verwerfen?',
    body: 'Dieser Upload hat DeepSign nie erreicht und wird lokal entfernt.',
    confirmLabel: 'Verwerfen',
    showDownload: false,
  },
  error: {
    title: 'Upload verwerfen?',
    body: 'Dieser Upload hat DeepSign nie erreicht und wird lokal entfernt.',
    confirmLabel: 'Verwerfen',
    showDownload: false,
  },
  draft: {
    title: 'Signierungsprozess löschen?',
    body: 'Das Dokument wird bei DeepSign gelöscht. Es wurden noch keine Einladungen versandt.',
    confirmLabel: 'Löschen',
    showDownload: false,
  },
  'in-progress': {
    title: 'Zurückziehen und löschen?',
    body: 'Der Signierungsprozess wird zuerst zurückgezogen, dann gelöscht. Nicht unterschreibende Personen erhalten eine Rückzugsmitteilung von DeepSign. Dieser Vorgang kann nicht rückgängig gemacht werden.',
    confirmLabel: 'Zurückziehen & löschen',
    showDownload: false,
  },
  signed: {
    title: 'Signiertes Dokument löschen?',
    body: '⚠️ Damit wird das signierte PDF dauerhaft gelöscht. Stellen Sie sicher, dass Sie eine Kopie heruntergeladen haben.',
    confirmLabel: 'Signiertes PDF löschen',
    showDownload: true,
  },
  withdrawn: {
    title: 'Signierungsprozess löschen?',
    body: 'Damit werden der Signierungsprozess und seine Historie entfernt.',
    confirmLabel: 'Löschen',
    showDownload: false,
  },
  rejected: {
    title: 'Signierungsprozess löschen?',
    body: 'Damit werden der Signierungsprozess und seine Historie entfernt.',
    confirmLabel: 'Löschen',
    showDownload: false,
  },
};

@Component({
  selector: 'bk-esign-delete-confirm-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    IonHeader, IonToolbar, IonTitle, IonButtons, IonButton,
    IonContent, IonItem, IonLabel, IonTextarea,
  ],
  template: `
    <ion-header>
      <ion-toolbar color="danger">
        <ion-title>{{ config().title }}</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="cancel()">Abbrechen</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <p>{{ config().body }}</p>
      <ion-item>
        <ion-label position="stacked">Grund (optional)</ion-label>
        <ion-textarea [(ngModel)]="reason" rows="3" />
      </ion-item>
      @if(config().showDownload) {
        <ion-button expand="block" fill="outline" (click)="downloadSigned()">
          Signiertes PDF herunterladen
        </ion-button>
      }
      <ion-button expand="block" color="danger" (click)="confirm()">
        {{ config().confirmLabel }}
      </ion-button>
    </ion-content>
  `,
})
export class EsignDeleteConfirmModal {
  public readonly record = input.required<EsignRecord>();

  private readonly modalController = inject(ModalController);
  protected readonly reason = signal('');

  protected readonly config = computed<DeleteConfig>(() => {
    const status = this.record().documentStatus;
    return DELETE_CONFIG[status] ?? DELETE_CONFIG['draft'];
  });

  protected async confirm(): Promise<void> {
    await this.modalController.dismiss({ confirmed: true, reason: this.reason() });
  }

  protected async cancel(): Promise<void> {
    await this.modalController.dismiss({ confirmed: false });
  }

  protected downloadSigned(): void {
    const path = this.record().signedPdfPath;
    if (path) window.open(path, '_blank');
  }
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit -p libs/esign/feature/tsconfig.json
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add libs/esign/feature/src/lib/esign-delete-confirm.modal.ts
git commit -m "feat(esign): EsignDeleteConfirmModal — status-adaptive dialog"
```

---

### Task 18: Routes, i18n, project.json assets

**Files:**
- Create: `libs/esign/feature/src/i18n/de.json`
- Modify: `apps/scs-app/src/app/app.routes.ts`
- Modify: `apps/scs-app/project.json`

- [ ] **Step 1: Create i18n file**

```json
{
  "list": { "title": "E-Signaturen" },
  "empty": "Keine Signierungsprozesse gefunden.",
  "send": {
    "conf": "Dokument zur Signierung gesendet.",
    "error": "Fehler beim Senden."
  },
  "delete": {
    "conf": "Signierungsprozess gelöscht.",
    "error": "Fehler beim Löschen."
  },
  "email": {
    "conf": "E-Mail versandt.",
    "error": "E-Mail-Versand fehlgeschlagen."
  },
  "action": {
    "status_view": "Signierungsstatus anzeigen",
    "document_view": "PDF anzeigen",
    "document_share": "Teilen",
    "document_send": "Per E-Mail senden",
    "esign_delete": "Signierungsprozess löschen"
  },
  "error": {
    "file_too_large": "Datei überschreitet 40 MB Limit.",
    "no_signature_fields": "Keine Signaturfelder im PDF gefunden. Bitte Text-Feld-Muster einbetten."
  },
  "status": {
    "uploading": "Wird hochgeladen",
    "draft": "Entwurf",
    "in-progress": "In Bearbeitung",
    "signed": "Signiert",
    "withdrawn": "Zurückgezogen",
    "rejected": "Abgelehnt",
    "error": "Fehler"
  },
  "cancel": "Abbrechen"
}
```

Save to `libs/esign/feature/src/i18n/de.json`.

- [ ] **Step 2: Add route to app.routes.ts**

In `apps/scs-app/src/app/app.routes.ts`, add after the `document` route block (around where `/document` is defined):

```typescript
{
  path: 'esign',
  canActivate: [isPrivilegedGuard],
  children: [
    {
      path: '',
      loadComponent: () => import('@bk2/esign-feature').then(m => m.EsignList),
    },
  ],
},
```

- [ ] **Step 3: Add asset glob to apps/scs-app/project.json**

In `apps/scs-app/project.json`, find the `assets` array in the `build` target and add:

```json
{
  "glob": "*.json",
  "input": "libs/esign/feature/src/i18n",
  "output": "./assets/i18n/esign/feature"
}
```

- [ ] **Step 4: Commit**

```bash
git add libs/esign/feature/src/i18n/de.json apps/scs-app/src/app/app.routes.ts apps/scs-app/project.json
git commit -m "feat(esign): routes, i18n, asset config"
```

---

### Task 19: Final type-check and build verification

**Files:** No new files — verification only.

- [ ] **Step 1: Type-check all new libs**

```bash
npx tsc --noEmit -p libs/shared/models/tsconfig.json && \
npx tsc --noEmit -p libs/esign/data-access/tsconfig.json && \
npx tsc --noEmit -p libs/esign/feature/tsconfig.json
```

Expected: zero errors across all three.

- [ ] **Step 2: Build Cloud Functions**

```bash
pnpm nx build functions --configuration production 2>&1 | tail -30
```

Expected: build succeeds.

- [ ] **Step 3: Build scs-app**

```bash
pnpm nx build scs-app 2>&1 | tail -30
```

Expected: build succeeds with no TypeScript errors in esign files.

- [ ] **Step 4: Fix any type errors found**

Common issues:
- `EsignDocumentStatus` import missing → add `import { EsignDocumentStatus } from '@bk2/shared-models'`
- `Timestamp` type mismatch (admin vs client) → use type assertion if needed
- Missing `export` in index.ts → add it

- [ ] **Step 5: Commit any fixes**

```bash
git add <changed files>
git commit -m "fix(esign): type-check errors"
```

---

## Self-Review

**Spec coverage check:**

| Spec section | Covered by |
| --- | --- |
| §3 Text Field Patterns | EsignService.scanPredefined (Task 3) + EsignList upload flow (Task 15) |
| §4.1 esignScanPredefined | Task 3 |
| §4.2 esignSendDocument | Task 4 |
| §4.3 esignGetDocumentDetails | Task 5 |
| §4.4 esignDelete (all status branches) | Task 6 |
| §4.5 esignSendByEmail | Task 7 |
| §4.6 esignWebhook + HMAC | Task 8 |
| §4.7 esignArchiveSigned trigger | Task 9 |
| §5 Webhook security | Task 2 (HMAC helpers) + Task 8 |
| §6.1 EsignRecord Firestore schema | Task 1 |
| §6.2 Security rules | Task 11 |
| §6.3 Indexes | Note: Firestore indexes must be added to `firestore.indexes.json` manually before deploying. Add composite indexes `(tenantId asc, createdAt desc)` and `(tenantId asc, documentStatus asc, createdAt desc)`. |
| §7.1 EsignListPage | Task 15 |
| §7.2 Actionsheet actions | Task 15 (`showActions`) |
| §7.3 EsignViewModal | Task 16 |
| §7.4 Delete confirm dialog | Task 17 |
| §8 Status mapping / chip colours | Task 15 (STATUS_COLORS) + Task 16 (signeeChipColor) |
| §9 File size ≤ 40 MB | Task 2 (CF) + Task 15 (client-side check) |
| §9 No predefined fields → abort | Task 15 (upload flow error check) |
| §10 Secrets configuration | Task 2 (`defineSecret` calls) |

**⚠️ One gap identified:** Firestore composite indexes (`firestore.indexes.json`) are not created in any task. After deployment, add them manually in the Firebase Console or add a Task 19b. The two needed indexes:
- Collection: `esignList`, fields: `tenantId ASC, createdAt DESC`
- Collection: `esignList`, fields: `tenantId ASC, documentStatus ASC, createdAt DESC`

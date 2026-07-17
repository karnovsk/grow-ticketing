# Grow Ticketing System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Firebase-based system that issues an emailed QR-code pickup ticket when a Grow purchase webhook fires, and lets authenticated staff scan or manually search and validate tickets at a single delivery point, with a full issued/validated audit trail.

**Architecture:** Firebase Cloud Functions (TypeScript) receive Grow's webhook, create a ticket record in Firestore, and email the customer a QR code. A Vite/vanilla-TypeScript staff web app (Firebase Hosting, Firebase Auth) scans QR codes or searches tickets manually, calling Cloud Functions callables to validate them. Firestore security rules block all direct client writes; only Cloud Functions (Admin SDK) can mutate ticket state.

**Tech Stack:** Firebase (Cloud Functions v2, Firestore, Firebase Auth, Firebase Hosting), Node 20, TypeScript, Jest (functions), Vite + Vitest (web), `qrcode` (QR generation), `html5-qrcode` (QR scanning), Resend (transactional email).

Reference spec: `docs/superpowers/specs/2026-07-17-grow-ticketing-design.md`

## Global Constraints

- Node 20 runtime for all Cloud Functions.
- TypeScript throughout, both `functions/` and `web/`.
- Single Firestore collection `tickets`; document ID equals the ticket's token.
- Ticket IDs are generated via Node's `crypto.randomUUID()` — unguessable, non-sequential. No other ID scheme is used anywhere.
- SMS delivery and the public token-gated ticket page are explicitly deferred — do not build them in this plan.
- Ticket records (including customer PII) are retained indefinitely — no TTL or scheduled cleanup job.
- Target volume is 100–1,000 tickets/month — free-tier quotas (Firebase Spark/Blaze free tier, Resend free tier) are assumed sufficient; no cost-optimization work is in scope.
- The Grow webhook authenticity check (`GROW_WEBHOOK_KEY` shared-secret comparison against the payload's `webhookKey` field) is a documented assumption pending confirmation with Grow support — implement it as a configurable secret, never hardcode the expected value.
- Single delivery location. Staff accounts are individually provisioned in the Firebase Auth console (no public self-signup) — any authenticated user is staff by definition.

---

### Task 1: Firebase project scaffolding

**Files:**
- Create: `firebase.json`
- Create: `.firebaserc`
- Create: `firestore.rules`
- Create: `firestore.indexes.json`
- Create: `functions/package.json`
- Create: `functions/tsconfig.json`
- Create: `functions/jest.config.js`
- Create: `functions/src/index.ts`
- Test: `functions/src/index.test.ts`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: a working `functions/` TypeScript + Jest project; `firebase.json` with `functions`, `hosting`, `firestore`, and `emulators` config that later tasks extend.

- [ ] **Step 1: Create `firebase.json`**

```json
{
  "functions": [
    {
      "source": "functions",
      "codebase": "default",
      "predeploy": ["npm --prefix \"$RESOURCE_DIR\" run build"]
    }
  ],
  "hosting": {
    "public": "web/dist",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "rewrites": [{ "source": "**", "destination": "/index.html" }]
  },
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  },
  "emulators": {
    "functions": { "port": 5001 },
    "firestore": { "port": 8080 },
    "auth": { "port": 9099 },
    "hosting": { "port": 5000 },
    "ui": { "enabled": true }
  }
}
```

- [ ] **Step 2: Create `.firebaserc`**

```json
{
  "projects": {
    "default": "REPLACE_WITH_YOUR_FIREBASE_PROJECT_ID"
  }
}
```

- [ ] **Step 3: Create `firestore.rules` (deny-all placeholder, tightened in Task 7)**

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

- [ ] **Step 4: Create `firestore.indexes.json` (empty; Task 12 adds the dashboard's composite index)**

```json
{
  "indexes": [],
  "fieldOverrides": []
}
```

- [ ] **Step 5: Create `functions/package.json`**

```json
{
  "name": "functions",
  "engines": { "node": "20" },
  "main": "lib/index.js",
  "scripts": {
    "build": "tsc",
    "test": "jest",
    "test:emulator": "firebase emulators:exec --project demo-grow-ticketing --only firestore \"jest --runInBand\""
  },
  "dependencies": {
    "firebase-admin": "^12.6.0",
    "firebase-functions": "^5.1.1",
    "qrcode": "^1.5.4"
  },
  "devDependencies": {
    "@firebase/rules-unit-testing": "^3.0.4",
    "@types/jest": "^29.5.12",
    "@types/node": "^20.14.0",
    "@types/qrcode": "^1.5.5",
    "firebase-tools": "^13.20.0",
    "jest": "^29.7.0",
    "ts-jest": "^29.2.5",
    "typescript": "^5.5.4"
  }
}
```

- [ ] **Step 6: Create `functions/tsconfig.json`**

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "target": "es2020",
    "lib": ["es2020"],
    "outDir": "lib",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true
  },
  "compileOnSave": true,
  "include": ["src"]
}
```

- [ ] **Step 7: Create `functions/jest.config.js`**

```js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
};
```

- [ ] **Step 8: Create `functions/src/index.ts` stub**

```ts
export {};
```

- [ ] **Step 9: Install dependencies**

Run: `npm --prefix functions install`
Expected: installs without errors, creates `functions/node_modules` and `functions/package-lock.json`.

- [ ] **Step 10: Write a smoke test — `functions/src/index.test.ts`**

```ts
import './index';

test('index module loads without throwing', () => {
  expect(true).toBe(true);
});
```

- [ ] **Step 11: Run the test suite to verify it passes**

Run: `npm --prefix functions test`
Expected: 1 passed test.

- [ ] **Step 12: Commit**

```bash
git add firebase.json .firebaserc firestore.rules firestore.indexes.json functions/package.json functions/package-lock.json functions/tsconfig.json functions/jest.config.js functions/src/index.ts functions/src/index.test.ts
git commit -m "Scaffold Firebase project and functions TypeScript setup"
```

---

### Task 2: Ticket types and Firestore ticket service

**Files:**
- Create: `functions/src/types.ts`
- Create: `functions/src/admin.ts`
- Create: `functions/src/testHelpers.ts`
- Create: `functions/src/testSetup.ts`
- Modify: `functions/jest.config.js` (add `setupFiles`)
- Create: `functions/src/ticketService.ts`
- Test: `functions/src/ticketService.test.ts`

**Interfaces:**
- Consumes: nothing new (Firestore emulator only).
- Produces: `Ticket`, `TicketItem`, `GrowWebhookPayload` types; `createTicket(input: NewTicketInput): Promise<Ticket>`, `findTicketByTransactionCode(code: string): Promise<Ticket | null>`, `getTicketById(id: string): Promise<Ticket | null>`, `updateEmailStatus(id: string, status: 'sent'|'failed'): Promise<void>`, `validateTicket(id: string, validatedBy: string, note?: string | null): Promise<ValidateResult>` — used by Tasks 3–6. (Manual search, per the spec, is served by the web app querying Firestore directly — Task 9's `searchTicketsByField` — since Task 7's rules already allow authenticated reads; there's no backend `searchTickets` function to avoid an unused duplicate code path.)

- [ ] **Step 1: Create `functions/src/types.ts`**

```ts
export interface TicketItem {
  name: string;
  quantity: number;
}

export interface Ticket {
  ticketId: string;
  status: 'issued' | 'validated';
  transactionCode: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
  items: TicketItem[];
  paymentSum: number;
  issuedAt: FirebaseFirestore.Timestamp;
  validatedAt: FirebaseFirestore.Timestamp | null;
  validatedBy: string | null;
  validationNote: string | null;
  emailStatus: 'sent' | 'failed';
}

export interface GrowWebhookPayload {
  webhookKey: string;
  transactionCode: string;
  paymentSum: number;
  payerFullName?: string;
  payerEmail?: string;
  payerPhone?: string;
  productData?: TicketItem[];
}
```

- [ ] **Step 2: Create `functions/src/admin.ts`**

```ts
import * as admin from 'firebase-admin';

if (admin.apps.length === 0) {
  admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'demo-grow-ticketing' });
}

export const db = admin.firestore();
```

- [ ] **Step 3: Create `functions/src/testHelpers.ts`**

```ts
export async function clearFirestoreEmulator(projectId: string): Promise<void> {
  const host = process.env.FIRESTORE_EMULATOR_HOST || 'localhost:8080';
  await fetch(`http://${host}/emulator/v1/projects/${projectId}/databases/(default)/documents`, {
    method: 'DELETE',
  });
}
```

- [ ] **Step 4: Create `functions/src/testSetup.ts`**

```ts
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || 'localhost:8080';
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || 'demo-grow-ticketing';
```

- [ ] **Step 5: Modify `functions/jest.config.js` to load the test setup**

```js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  setupFiles: ['<rootDir>/src/testSetup.ts'],
};
```

- [ ] **Step 6: Write the failing test — `functions/src/ticketService.test.ts`**

```ts
import {
  createTicket,
  findTicketByTransactionCode,
  getTicketById,
  updateEmailStatus,
  validateTicket,
} from './ticketService';
import { clearFirestoreEmulator } from './testHelpers';

const PROJECT_ID = process.env.GCLOUD_PROJECT || 'demo-grow-ticketing';

const sampleInput = {
  transactionCode: 'TX-1',
  customerName: 'Jane Doe',
  customerEmail: 'jane@example.com',
  customerPhone: '0501234567',
  items: [{ name: 'Widget', quantity: 2 }],
  paymentSum: 99.9,
};

describe('ticketService', () => {
  afterEach(async () => {
    await clearFirestoreEmulator(PROJECT_ID);
  });

  test('createTicket writes a ticket with status issued', async () => {
    const ticket = await createTicket(sampleInput);
    expect(ticket.status).toBe('issued');
    expect(ticket.transactionCode).toBe('TX-1');
    expect(ticket.ticketId).toHaveLength(36);
  });

  test('findTicketByTransactionCode finds an existing ticket', async () => {
    const created = await createTicket(sampleInput);
    const found = await findTicketByTransactionCode('TX-1');
    expect(found?.ticketId).toBe(created.ticketId);
  });

  test('findTicketByTransactionCode returns null when not found', async () => {
    const found = await findTicketByTransactionCode('NOPE');
    expect(found).toBeNull();
  });

  test('getTicketById returns null for an unknown id', async () => {
    const found = await getTicketById('does-not-exist');
    expect(found).toBeNull();
  });

  test('updateEmailStatus updates the emailStatus field', async () => {
    const ticket = await createTicket(sampleInput);
    await updateEmailStatus(ticket.ticketId, 'sent');
    const updated = await getTicketById(ticket.ticketId);
    expect(updated?.emailStatus).toBe('sent');
  });

  test('validateTicket transitions issued to validated', async () => {
    const ticket = await createTicket(sampleInput);
    const result = await validateTicket(ticket.ticketId, 'staff-uid-1');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.ticket.status).toBe('validated');
      expect(result.ticket.validatedBy).toBe('staff-uid-1');
    }
  });

  test('validateTicket rejects an already-validated ticket', async () => {
    const ticket = await createTicket(sampleInput);
    await validateTicket(ticket.ticketId, 'staff-uid-1');
    const result = await validateTicket(ticket.ticketId, 'staff-uid-2');
    expect(result.ok).toBe(false);
    if (!result.ok && result.reason === 'already_validated') {
      expect(result.ticket.validatedBy).toBe('staff-uid-1');
    }
  });

  test('validateTicket returns not_found for an unknown id', async () => {
    const result = await validateTicket('does-not-exist', 'staff-uid-1');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('not_found');
  });

});
```

- [ ] **Step 7: Run the test to verify it fails**

Run: `npm --prefix functions run test:emulator`
Expected: FAIL with "Cannot find module './ticketService'".

- [ ] **Step 8: Implement `functions/src/ticketService.ts`**

```ts
import * as admin from 'firebase-admin';
import { randomUUID } from 'crypto';
import { db } from './admin';
import { Ticket, TicketItem } from './types';

const COLLECTION = 'tickets';

export interface NewTicketInput {
  transactionCode: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
  items: TicketItem[];
  paymentSum: number;
}

export async function findTicketByTransactionCode(transactionCode: string): Promise<Ticket | null> {
  const snap = await db.collection(COLLECTION).where('transactionCode', '==', transactionCode).limit(1).get();
  if (snap.empty) return null;
  return snap.docs[0].data() as Ticket;
}

export async function createTicket(input: NewTicketInput): Promise<Ticket> {
  const ticketId = randomUUID();
  const ticket: Ticket = {
    ticketId,
    status: 'issued',
    transactionCode: input.transactionCode,
    customerName: input.customerName,
    customerEmail: input.customerEmail,
    customerPhone: input.customerPhone,
    items: input.items,
    paymentSum: input.paymentSum,
    issuedAt: admin.firestore.Timestamp.now(),
    validatedAt: null,
    validatedBy: null,
    validationNote: null,
    emailStatus: 'failed',
  };
  await db.collection(COLLECTION).doc(ticketId).set(ticket);
  return ticket;
}

export async function getTicketById(ticketId: string): Promise<Ticket | null> {
  const doc = await db.collection(COLLECTION).doc(ticketId).get();
  return doc.exists ? (doc.data() as Ticket) : null;
}

export async function updateEmailStatus(ticketId: string, status: 'sent' | 'failed'): Promise<void> {
  await db.collection(COLLECTION).doc(ticketId).update({ emailStatus: status });
}

export type ValidateResult =
  | { ok: true; ticket: Ticket }
  | { ok: false; reason: 'not_found' }
  | { ok: false; reason: 'already_validated'; ticket: Ticket };

export async function validateTicket(
  ticketId: string,
  validatedBy: string,
  note: string | null = null,
): Promise<ValidateResult> {
  const ref = db.collection(COLLECTION).doc(ticketId);
  const doc = await ref.get();
  if (!doc.exists) return { ok: false, reason: 'not_found' };
  const ticket = doc.data() as Ticket;
  if (ticket.status === 'validated') return { ok: false, reason: 'already_validated', ticket };
  const validatedAt = admin.firestore.Timestamp.now();
  await ref.update({ status: 'validated', validatedAt, validatedBy, validationNote: note });
  return { ok: true, ticket: { ...ticket, status: 'validated', validatedAt, validatedBy, validationNote: note } };
}

```

- [ ] **Step 9: Run the test to verify it passes**

Run: `npm --prefix functions run test:emulator`
Expected: 8 passed tests.

- [ ] **Step 10: Commit**

```bash
git add functions/src/types.ts functions/src/admin.ts functions/src/testHelpers.ts functions/src/testSetup.ts functions/jest.config.js functions/src/ticketService.ts functions/src/ticketService.test.ts
git commit -m "Add ticket types and Firestore ticket service"
```

---

### Task 3: QR code generation helper

**Files:**
- Create: `functions/src/qr.ts`
- Test: `functions/src/qr.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `generateQrDataUri(ticketId: string): Promise<string>` — used by Task 5 (webhook handler) and Task 6 (resend-email callable).

- [ ] **Step 1: Write the failing test — `functions/src/qr.test.ts`**

```ts
import { generateQrDataUri } from './qr';

describe('generateQrDataUri', () => {
  test('returns a base64 PNG data URI', async () => {
    const uri = await generateQrDataUri('abc-123');
    expect(uri.startsWith('data:image/png;base64,')).toBe(true);
  });

  test('encodes different ticket ids into different data', async () => {
    const a = await generateQrDataUri('ticket-a');
    const b = await generateQrDataUri('ticket-b');
    expect(a).not.toBe(b);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm --prefix functions test -- qr.test.ts`
Expected: FAIL with "Cannot find module './qr'".

- [ ] **Step 3: Implement `functions/src/qr.ts`**

```ts
import QRCode from 'qrcode';

export async function generateQrDataUri(ticketId: string): Promise<string> {
  return QRCode.toDataURL(ticketId, { margin: 1, width: 300 });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm --prefix functions test -- qr.test.ts`
Expected: 2 passed tests.

- [ ] **Step 5: Commit**

```bash
git add functions/src/qr.ts functions/src/qr.test.ts
git commit -m "Add QR code generation helper"
```

---

### Task 4: Email copy settings, builder, and sender

**Files:**
- Create: `functions/src/settings.ts`
- Test: `functions/src/settings.test.ts`
- Create: `functions/src/email.ts`
- Test: `functions/src/email.test.ts`

**Interfaces:**
- Consumes: `Ticket` type and `db` from `functions/src/types.ts` / `functions/src/admin.ts`.
- Produces: `EmailSettings` type and `getEmailSettings(): Promise<EmailSettings>` — reads the `settings/emailTemplate` Firestore document (subject/greeting/QR-instructions/items-label), falling back to built-in defaults if the document doesn't exist, so the email's non-QR wording is editable from the Firebase console without a code change or redeploy. `buildTicketEmailHtml(ticket: Ticket, qrDataUri: string, settings: EmailSettings): string`, `sendTicketEmail(ticket: Ticket, qrDataUri: string): Promise<boolean>` — used by Task 5 and Task 6. Reads `process.env.RESEND_API_KEY` and `process.env.TICKET_EMAIL_FROM`.

- [ ] **Step 1: Write the failing test — `functions/src/settings.test.ts`**

```ts
import { getEmailSettings } from './settings';
import { db } from './admin';
import { clearFirestoreEmulator } from './testHelpers';

const PROJECT_ID = process.env.GCLOUD_PROJECT || 'demo-grow-ticketing';

describe('getEmailSettings', () => {
  afterEach(async () => {
    await clearFirestoreEmulator(PROJECT_ID);
  });

  test('returns defaults when no settings document exists', async () => {
    const settings = await getEmailSettings();
    expect(settings.subject).toBe('Your pickup ticket');
    expect(settings.greeting).toBe('Thanks for your purchase!');
  });

  test('overrides defaults with fields from the settings document', async () => {
    await db.collection('settings').doc('emailTemplate').set({ subject: 'Custom subject line' });
    const settings = await getEmailSettings();
    expect(settings.subject).toBe('Custom subject line');
    expect(settings.greeting).toBe('Thanks for your purchase!');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm --prefix functions run test:emulator -- settings.test.ts`
Expected: FAIL with "Cannot find module './settings'".

- [ ] **Step 3: Implement `functions/src/settings.ts`**

```ts
import { db } from './admin';

export interface EmailSettings {
  subject: string;
  greeting: string;
  qrInstructions: string;
  itemsLabel: string;
}

const DEFAULT_EMAIL_SETTINGS: EmailSettings = {
  subject: 'Your pickup ticket',
  greeting: 'Thanks for your purchase!',
  qrInstructions: 'Show this QR code at pickup:',
  itemsLabel: 'Items:',
};

export async function getEmailSettings(): Promise<EmailSettings> {
  const doc = await db.collection('settings').doc('emailTemplate').get();
  if (!doc.exists) return DEFAULT_EMAIL_SETTINGS;
  return { ...DEFAULT_EMAIL_SETTINGS, ...(doc.data() as Partial<EmailSettings>) };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm --prefix functions run test:emulator -- settings.test.ts`
Expected: 2 passed tests.

- [ ] **Step 5: Write the failing test — `functions/src/email.test.ts`**

```ts
import * as admin from 'firebase-admin';
import { buildTicketEmailHtml, sendTicketEmail } from './email';
import { Ticket } from './types';
import { EmailSettings } from './settings';

jest.mock('./settings', () => ({
  getEmailSettings: jest.fn().mockResolvedValue({
    subject: 'Your pickup ticket',
    greeting: 'Thanks for your purchase!',
    qrInstructions: 'Show this QR code at pickup:',
    itemsLabel: 'Items:',
  }),
}));

const sampleTicket: Ticket = {
  ticketId: 'ticket-1',
  status: 'issued',
  transactionCode: 'TX-1',
  customerName: 'Jane Doe',
  customerEmail: 'jane@example.com',
  customerPhone: null,
  items: [{ name: 'Widget', quantity: 2 }],
  paymentSum: 50,
  issuedAt: admin.firestore.Timestamp.now(),
  validatedAt: null,
  validatedBy: null,
  validationNote: null,
  emailStatus: 'failed',
};

const sampleSettings: EmailSettings = {
  subject: 'Your pickup ticket',
  greeting: 'Thanks for your purchase!',
  qrInstructions: 'Show this QR code at pickup:',
  itemsLabel: 'Items:',
};

describe('buildTicketEmailHtml', () => {
  test('includes customer name, settings copy, QR image, and item list', () => {
    const html = buildTicketEmailHtml(sampleTicket, 'data:image/png;base64,ABC', sampleSettings);
    expect(html).toContain('Jane Doe');
    expect(html).toContain('Thanks for your purchase!');
    expect(html).toContain('data:image/png;base64,ABC');
    expect(html).toContain('2 x Widget');
  });
});

describe('sendTicketEmail', () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.RESEND_API_KEY;

  beforeEach(() => {
    process.env.RESEND_API_KEY = 'test-key';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.RESEND_API_KEY = originalKey;
  });

  test('returns true when Resend responds ok', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true } as Response);
    const result = await sendTicketEmail(sampleTicket, 'data:image/png;base64,ABC');
    expect(result).toBe(true);
  });

  test('returns false when Resend responds with an error', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false } as Response);
    const result = await sendTicketEmail(sampleTicket, 'data:image/png;base64,ABC');
    expect(result).toBe(false);
  });

  test('throws when RESEND_API_KEY is not configured', async () => {
    delete process.env.RESEND_API_KEY;
    await expect(sendTicketEmail(sampleTicket, 'data:image/png;base64,ABC')).rejects.toThrow('RESEND_API_KEY');
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `npm --prefix functions test -- email.test.ts`
Expected: FAIL with "Cannot find module './email'".

- [ ] **Step 7: Implement `functions/src/email.ts`**

```ts
import { Ticket } from './types';
import { EmailSettings, getEmailSettings } from './settings';

export function buildTicketEmailHtml(ticket: Ticket, qrDataUri: string, settings: EmailSettings): string {
  const itemsHtml = ticket.items.map((item) => `<li>${item.quantity} x ${item.name}</li>`).join('');
  return `
    <div>
      <p>Hi ${ticket.customerName}, ${settings.greeting}</p>
      <p>${settings.qrInstructions}</p>
      <img src="${qrDataUri}" alt="Pickup QR code" width="300" height="300" />
      <p>${settings.itemsLabel}</p>
      <ul>${itemsHtml}</ul>
    </div>
  `;
}

export async function sendTicketEmail(ticket: Ticket, qrDataUri: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error('RESEND_API_KEY is not configured');
  }
  const settings = await getEmailSettings();
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.TICKET_EMAIL_FROM || 'tickets@example.com',
      to: ticket.customerEmail,
      subject: settings.subject,
      html: buildTicketEmailHtml(ticket, qrDataUri, settings),
    }),
  });
  return response.ok;
}
```

Note: `sendTicketEmail` checks `RESEND_API_KEY` before calling `getEmailSettings()`, so the "throws when not configured" test never touches Firestore — only `settings.test.ts` needs the emulator; `email.test.ts` runs fine standalone because `jest.mock('./settings', ...)` replaces the module (and its `./admin` import chain) before it's ever loaded.

- [ ] **Step 8: Run the test to verify it passes**

Run: `npm --prefix functions test -- email.test.ts`
Expected: 4 passed tests.

- [ ] **Step 9: Commit**

```bash
git add functions/src/settings.ts functions/src/settings.test.ts functions/src/email.ts functions/src/email.test.ts
git commit -m "Add configurable email copy settings, builder, and sender"
```

---

### Task 5: Webhook authenticity check and growWebhook function

**Files:**
- Create: `functions/src/webhookAuth.ts`
- Test: `functions/src/webhookAuth.test.ts`
- Create: `functions/src/secrets.ts`
- Create: `functions/src/webhookHandler.ts`
- Test: `functions/src/webhookHandler.test.ts`
- Modify: `functions/src/index.ts`

**Interfaces:**
- Consumes: `GrowWebhookPayload` (Task 2), `createTicket`/`findTicketByTransactionCode`/`updateEmailStatus` (Task 2), `generateQrDataUri` (Task 3), `sendTicketEmail` (Task 4).
- Produces: `verifyWebhookKey(payload): boolean`, `handleGrowWebhook(rawBody: unknown): Promise<WebhookResult>`, the deployed `growWebhook` HTTPS function, and `growWebhookKeySecret`/`resendApiKeySecret` (`functions/src/secrets.ts`) reused by Task 6.

- [ ] **Step 1: Write the failing test — `functions/src/webhookAuth.test.ts`**

```ts
import { verifyWebhookKey } from './webhookAuth';
import { GrowWebhookPayload } from './types';

function payload(webhookKey: string): GrowWebhookPayload {
  return { webhookKey, transactionCode: 'TX-1', paymentSum: 1 };
}

describe('verifyWebhookKey', () => {
  const originalKey = process.env.GROW_WEBHOOK_KEY;

  afterEach(() => {
    process.env.GROW_WEBHOOK_KEY = originalKey;
  });

  test('returns true when the payload key matches the configured secret', () => {
    process.env.GROW_WEBHOOK_KEY = 'expected-secret';
    expect(verifyWebhookKey(payload('expected-secret'))).toBe(true);
  });

  test('returns false when the payload key does not match', () => {
    process.env.GROW_WEBHOOK_KEY = 'expected-secret';
    expect(verifyWebhookKey(payload('wrong'))).toBe(false);
  });

  test('throws when GROW_WEBHOOK_KEY is not configured', () => {
    delete process.env.GROW_WEBHOOK_KEY;
    expect(() => verifyWebhookKey(payload('anything'))).toThrow('GROW_WEBHOOK_KEY');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm --prefix functions test -- webhookAuth.test.ts`
Expected: FAIL with "Cannot find module './webhookAuth'".

- [ ] **Step 3: Implement `functions/src/webhookAuth.ts`**

```ts
import { GrowWebhookPayload } from './types';

// Assumes Grow's `webhookKey` field is a shared secret — confirm this with Grow
// support when enabling webhooks (see spec's Security section: this is an
// open question, not a documented guarantee from Grow).
export function verifyWebhookKey(payload: GrowWebhookPayload): boolean {
  const expected = process.env.GROW_WEBHOOK_KEY;
  if (!expected) {
    throw new Error('GROW_WEBHOOK_KEY is not configured');
  }
  return payload.webhookKey === expected;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm --prefix functions test -- webhookAuth.test.ts`
Expected: 3 passed tests.

- [ ] **Step 5: Create `functions/src/secrets.ts`**

```ts
import { defineSecret } from 'firebase-functions/params';

export const growWebhookKeySecret = defineSecret('GROW_WEBHOOK_KEY');
export const resendApiKeySecret = defineSecret('RESEND_API_KEY');
```

- [ ] **Step 6: Write the failing test — `functions/src/webhookHandler.test.ts`**

```ts
import { handleGrowWebhook } from './webhookHandler';
import { clearFirestoreEmulator } from './testHelpers';

jest.mock('./qr', () => ({
  generateQrDataUri: jest.fn().mockResolvedValue('data:image/png;base64,ABC'),
}));
jest.mock('./email', () => ({
  sendTicketEmail: jest.fn().mockResolvedValue(true),
}));

const PROJECT_ID = process.env.GCLOUD_PROJECT || 'demo-grow-ticketing';

const validPayload = {
  webhookKey: 'secret-1',
  transactionCode: 'TX-100',
  paymentSum: 42,
  payerFullName: 'Jane Doe',
  payerEmail: 'jane@example.com',
  payerPhone: '0501234567',
  productData: [{ name: 'Widget', quantity: 1 }],
};

describe('handleGrowWebhook', () => {
  const originalKey = process.env.GROW_WEBHOOK_KEY;

  beforeEach(() => {
    process.env.GROW_WEBHOOK_KEY = 'secret-1';
  });

  afterEach(async () => {
    process.env.GROW_WEBHOOK_KEY = originalKey;
    await clearFirestoreEmulator(PROJECT_ID);
  });

  test('creates a ticket for a valid payload', async () => {
    const result = await handleGrowWebhook(validPayload);
    expect(result.status).toBe(200);
    expect(result.body.created).toBe(true);
  });

  test('does not create a duplicate ticket for a repeated transactionCode', async () => {
    const first = await handleGrowWebhook(validPayload);
    const second = await handleGrowWebhook(validPayload);
    expect(second.body.created).toBe(false);
    expect(second.body.ticketId).toBe(first.body.ticketId);
  });

  test('rejects a payload with the wrong webhook key', async () => {
    const result = await handleGrowWebhook({ ...validPayload, webhookKey: 'wrong' });
    expect(result.status).toBe(401);
  });

  test('rejects a payload missing required fields', async () => {
    const result = await handleGrowWebhook({ webhookKey: 'secret-1' });
    expect(result.status).toBe(400);
  });
});
```

- [ ] **Step 7: Run the test to verify it fails**

Run: `npm --prefix functions run test:emulator -- webhookHandler.test.ts`
Expected: FAIL with "Cannot find module './webhookHandler'".

- [ ] **Step 8: Implement `functions/src/webhookHandler.ts`**

```ts
import { GrowWebhookPayload, TicketItem } from './types';
import { verifyWebhookKey } from './webhookAuth';
import { createTicket, findTicketByTransactionCode, updateEmailStatus } from './ticketService';
import { generateQrDataUri } from './qr';
import { sendTicketEmail } from './email';

export interface WebhookResult {
  status: number;
  body: Record<string, unknown>;
}

function parsePayload(body: unknown): GrowWebhookPayload | null {
  if (typeof body !== 'object' || body === null) return null;
  const record = body as Record<string, unknown>;
  if (typeof record.webhookKey !== 'string') return null;
  if (typeof record.transactionCode !== 'string') return null;
  if (typeof record.paymentSum !== 'number') return null;
  if (typeof record.payerEmail !== 'string') return null;
  return {
    webhookKey: record.webhookKey,
    transactionCode: record.transactionCode,
    paymentSum: record.paymentSum,
    payerFullName: typeof record.payerFullName === 'string' ? record.payerFullName : undefined,
    payerEmail: record.payerEmail,
    payerPhone: typeof record.payerPhone === 'string' ? record.payerPhone : undefined,
    productData: Array.isArray(record.productData) ? (record.productData as TicketItem[]) : undefined,
  };
}

export async function handleGrowWebhook(rawBody: unknown): Promise<WebhookResult> {
  const payload = parsePayload(rawBody);
  if (!payload) {
    return { status: 400, body: { error: 'invalid_payload' } };
  }
  if (!verifyWebhookKey(payload)) {
    return { status: 401, body: { error: 'invalid_webhook_key' } };
  }

  const existing = await findTicketByTransactionCode(payload.transactionCode);
  if (existing) {
    return { status: 200, body: { ticketId: existing.ticketId, created: false } };
  }

  const ticket = await createTicket({
    transactionCode: payload.transactionCode,
    customerName: payload.payerFullName || 'Customer',
    customerEmail: payload.payerEmail || '',
    customerPhone: payload.payerPhone || null,
    items: payload.productData || [],
    paymentSum: payload.paymentSum,
  });

  const qrDataUri = await generateQrDataUri(ticket.ticketId);
  const sent = await sendTicketEmail(ticket, qrDataUri);
  await updateEmailStatus(ticket.ticketId, sent ? 'sent' : 'failed');

  return { status: 200, body: { ticketId: ticket.ticketId, created: true } };
}
```

- [ ] **Step 9: Run the test to verify it passes**

Run: `npm --prefix functions run test:emulator -- webhookHandler.test.ts`
Expected: 4 passed tests.

- [ ] **Step 10: Modify `functions/src/index.ts` to deploy the webhook**

```ts
import { onRequest } from 'firebase-functions/v2/https';
import { handleGrowWebhook } from './webhookHandler';
import { growWebhookKeySecret, resendApiKeySecret } from './secrets';

export const growWebhook = onRequest({ secrets: [growWebhookKeySecret, resendApiKeySecret] }, async (req, res) => {
  const result = await handleGrowWebhook(req.body);
  res.status(result.status).json(result.body);
});
```

- [ ] **Step 11: Run the full functions test suite to confirm nothing broke**

Run: `npm --prefix functions run test:emulator`
Expected: all tests passed.

- [ ] **Step 12: Commit**

```bash
git add functions/src/webhookAuth.ts functions/src/webhookAuth.test.ts functions/src/secrets.ts functions/src/webhookHandler.ts functions/src/webhookHandler.test.ts functions/src/index.ts
git commit -m "Add webhook authenticity check and growWebhook function"
```

---

### Task 6: validateTicket and resendTicketEmail callable functions

**Files:**
- Create: `functions/src/callables.ts`
- Test: `functions/src/callables.test.ts`
- Modify: `functions/src/index.ts`

**Interfaces:**
- Consumes: `validateTicket`/`getTicketById`/`updateEmailStatus` (Task 2), `generateQrDataUri` (Task 3), `sendTicketEmail` (Task 4), `resendApiKeySecret` (Task 5).
- Produces: `handleValidateTicket(data, auth)`, `handleResendTicketEmail(data, auth)`, and the deployed `validateTicketCallable`/`resendTicketEmailCallable` functions — called by the web app in Tasks 9–11 as `validateTicketCallable` / `resendTicketEmailCallable`.

- [ ] **Step 1: Write the failing test — `functions/src/callables.test.ts`**

```ts
import { createTicket } from './ticketService';
import { handleValidateTicket, handleResendTicketEmail } from './callables';
import { clearFirestoreEmulator } from './testHelpers';

jest.mock('./qr', () => ({ generateQrDataUri: jest.fn().mockResolvedValue('data:image/png;base64,ABC') }));
jest.mock('./email', () => ({ sendTicketEmail: jest.fn().mockResolvedValue(true) }));

const PROJECT_ID = process.env.GCLOUD_PROJECT || 'demo-grow-ticketing';

const sampleInput = {
  transactionCode: 'TX-200',
  customerName: 'Jane Doe',
  customerEmail: 'jane@example.com',
  customerPhone: null,
  items: [{ name: 'Widget', quantity: 1 }],
  paymentSum: 10,
};

describe('handleValidateTicket', () => {
  afterEach(async () => {
    await clearFirestoreEmulator(PROJECT_ID);
  });

  test('validates an issued ticket for an authenticated caller', async () => {
    const ticket = await createTicket(sampleInput);
    const result = await handleValidateTicket({ ticketId: ticket.ticketId }, { uid: 'staff-1' });
    expect(result.ok).toBe(true);
  });

  test('throws unauthenticated when auth is missing', async () => {
    const ticket = await createTicket(sampleInput);
    await expect(handleValidateTicket({ ticketId: ticket.ticketId }, undefined)).rejects.toThrow('unauthenticated');
  });

  test('throws ticket_not_found for an unknown id', async () => {
    await expect(handleValidateTicket({ ticketId: 'nope' }, { uid: 'staff-1' })).rejects.toThrow('ticket_not_found');
  });
});

describe('handleResendTicketEmail', () => {
  afterEach(async () => {
    await clearFirestoreEmulator(PROJECT_ID);
  });

  test('resends the email and updates emailStatus', async () => {
    const ticket = await createTicket({ ...sampleInput, transactionCode: 'TX-201' });
    const result = await handleResendTicketEmail({ ticketId: ticket.ticketId }, { uid: 'staff-1' });
    expect(result.sent).toBe(true);
  });

  test('throws unauthenticated when auth is missing', async () => {
    await expect(handleResendTicketEmail({ ticketId: 'any' }, undefined)).rejects.toThrow('unauthenticated');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm --prefix functions run test:emulator -- callables.test.ts`
Expected: FAIL with "Cannot find module './callables'".

- [ ] **Step 3: Implement `functions/src/callables.ts`**

```ts
import { validateTicket, getTicketById, updateEmailStatus } from './ticketService';
import { sendTicketEmail } from './email';
import { generateQrDataUri } from './qr';

export interface CallableAuth {
  uid: string;
}

export type ValidateTicketData = { ticketId: string; note?: string };
export type ResendEmailData = { ticketId: string };

export async function handleValidateTicket(data: ValidateTicketData, auth: CallableAuth | undefined) {
  if (!auth) {
    throw new Error('unauthenticated');
  }
  const result = await validateTicket(data.ticketId, auth.uid, data.note ?? null);
  if (!result.ok && result.reason === 'not_found') {
    throw new Error('ticket_not_found');
  }
  return result;
}

export async function handleResendTicketEmail(data: ResendEmailData, auth: CallableAuth | undefined) {
  if (!auth) {
    throw new Error('unauthenticated');
  }
  const ticket = await getTicketById(data.ticketId);
  if (!ticket) {
    throw new Error('ticket_not_found');
  }
  const qrDataUri = await generateQrDataUri(ticket.ticketId);
  const sent = await sendTicketEmail(ticket, qrDataUri);
  await updateEmailStatus(ticket.ticketId, sent ? 'sent' : 'failed');
  return { sent };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm --prefix functions run test:emulator -- callables.test.ts`
Expected: 5 passed tests.

- [ ] **Step 5: Modify `functions/src/index.ts` to the full, final version**

```ts
import { onRequest, onCall } from 'firebase-functions/v2/https';
import { handleGrowWebhook } from './webhookHandler';
import { handleValidateTicket, handleResendTicketEmail } from './callables';
import { growWebhookKeySecret, resendApiKeySecret } from './secrets';

export const growWebhook = onRequest({ secrets: [growWebhookKeySecret, resendApiKeySecret] }, async (req, res) => {
  const result = await handleGrowWebhook(req.body);
  res.status(result.status).json(result.body);
});

export const validateTicketCallable = onCall(async (request) => {
  return handleValidateTicket(request.data, request.auth ? { uid: request.auth.uid } : undefined);
});

export const resendTicketEmailCallable = onCall({ secrets: [resendApiKeySecret] }, async (request) => {
  return handleResendTicketEmail(request.data, request.auth ? { uid: request.auth.uid } : undefined);
});
```

- [ ] **Step 6: Run the full functions test suite to confirm nothing broke**

Run: `npm --prefix functions run test:emulator`
Expected: all tests passed.

- [ ] **Step 7: Commit**

```bash
git add functions/src/callables.ts functions/src/callables.test.ts functions/src/index.ts
git commit -m "Add validateTicket and resendTicketEmail callable functions"
```

---

### Task 7: Firestore security rules

**Files:**
- Modify: `firestore.rules`
- Test: `functions/src/firestoreRules.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: enforced rule that only authenticated users can read `tickets`, and no client (authenticated or not) can write directly — all mutations must go through the Task 5/6 Cloud Functions (Admin SDK bypasses these rules).

- [ ] **Step 1: Write the failing test — `functions/src/firestoreRules.test.ts`**

```ts
import {
  initializeTestEnvironment,
  RulesTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import * as fs from 'fs';
import * as path from 'path';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-grow-ticketing-rules',
    firestore: {
      rules: fs.readFileSync(path.resolve(__dirname, '../../firestore.rules'), 'utf8'),
      host: 'localhost',
      port: 8080,
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

afterEach(async () => {
  await testEnv.clearFirestore();
});

describe('firestore.rules for tickets', () => {
  test('unauthenticated users cannot read tickets', async () => {
    const unauthedDb = testEnv.unauthenticatedContext().firestore();
    await assertFails(unauthedDb.collection('tickets').doc('t1').get());
  });

  test('authenticated users can read tickets', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().collection('tickets').doc('t1').set({ status: 'issued' });
    });
    const authedDb = testEnv.authenticatedContext('staff-1').firestore();
    await assertSucceeds(authedDb.collection('tickets').doc('t1').get());
  });

  test('authenticated users cannot write tickets directly', async () => {
    const authedDb = testEnv.authenticatedContext('staff-1').firestore();
    await assertFails(authedDb.collection('tickets').doc('t2').set({ status: 'issued' }));
  });
});
```

- [ ] **Step 2: Run the test to verify the write-permission test fails against the current deny-all rules but the read test also fails**

Run: `firebase emulators:exec --project demo-grow-ticketing-rules --only firestore "jest firestoreRules.test.ts"` (from `functions/`)
Expected: FAIL — "authenticated users can read tickets" fails because the current rules deny all reads.

- [ ] **Step 3: Modify `firestore.rules`**

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /tickets/{ticketId} {
      allow read: if request.auth != null;
      allow write: if false;
    }
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `firebase emulators:exec --project demo-grow-ticketing-rules --only firestore "jest firestoreRules.test.ts"` (from `functions/`)
Expected: 3 passed tests.

- [ ] **Step 5: Commit**

```bash
git add firestore.rules functions/src/firestoreRules.test.ts
git commit -m "Add Firestore security rules restricting tickets to authenticated read-only"
```

---

### Task 8: Staff web app scaffolding — Vite, Firebase client, login

**Files:**
- Create: `web/package.json`
- Create: `web/tsconfig.json`
- Create: `web/vite.config.ts`
- Create: `web/index.html`
- Create: `web/.env.example`
- Create: `web/src/firebaseClient.ts`
- Create: `web/src/auth.ts`
- Create: `web/src/main.ts`

**Interfaces:**
- Consumes: nothing new (talks to Firebase Auth directly).
- Produces: `auth`, `db`, `functions` (Firebase client handles, `web/src/firebaseClient.ts`), `login(email, password)`, `logout()`, `watchAuthState(callback)` (`web/src/auth.ts`) — used by Tasks 9–12.

- [ ] **Step 1: Create `web/package.json`**

```json
{
  "name": "grow-ticketing-web",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "test": "vitest run"
  },
  "dependencies": {
    "firebase": "^10.14.1",
    "html5-qrcode": "^2.3.8"
  },
  "devDependencies": {
    "jsdom": "^25.0.0",
    "typescript": "^5.5.4",
    "vite": "^5.4.6",
    "vitest": "^2.1.1"
  }
}
```

- [ ] **Step 2: Create `web/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "module": "ESNext",
    "lib": ["ES2020", "DOM"],
    "strict": true,
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `web/vite.config.ts`**

```ts
import { defineConfig } from 'vite';

export default defineConfig({
  test: {
    environment: 'jsdom',
  },
});
```

- [ ] **Step 4: Create `web/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Grow Ticketing — Staff</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 5: Create `web/.env.example`**

```
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

- [ ] **Step 6: Create `web/src/firebaseClient.ts`**

```ts
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const firebaseApp = initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);
export const db = getFirestore(firebaseApp);
export const functions = getFunctions(firebaseApp);
```

- [ ] **Step 7: Create `web/src/auth.ts`**

```ts
import { signInWithEmailAndPassword, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { auth } from './firebaseClient';

export function login(email: string, password: string) {
  return signInWithEmailAndPassword(auth, email, password);
}

export function logout() {
  return signOut(auth);
}

export function watchAuthState(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback);
}
```

- [ ] **Step 8: Create `web/src/main.ts`**

```ts
import { login, logout, watchAuthState } from './auth';

const app = document.querySelector<HTMLDivElement>('#app')!;

function renderLogin() {
  app.innerHTML = `
    <form id="login-form">
      <input id="email" type="email" placeholder="Email" required />
      <input id="password" type="password" placeholder="Password" required />
      <button type="submit">Log in</button>
      <p id="login-error" style="color: red;"></p>
    </form>
  `;
  const form = document.querySelector<HTMLFormElement>('#login-form')!;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = document.querySelector<HTMLInputElement>('#email')!.value;
    const password = document.querySelector<HTMLInputElement>('#password')!.value;
    try {
      await login(email, password);
    } catch (error) {
      document.querySelector<HTMLParagraphElement>('#login-error')!.textContent =
        'Login failed. Check your credentials.';
    }
  });
}

function renderApp(userEmail: string) {
  app.innerHTML = `
    <header>
      <span>Logged in as ${userEmail}</span>
      <button id="logout-button">Log out</button>
    </header>
    <nav>
      <a href="#scan">Scan</a>
      <a href="#search">Search</a>
      <a href="#dashboard">Dashboard</a>
    </nav>
    <main id="view"></main>
  `;
  document.querySelector<HTMLButtonElement>('#logout-button')!.addEventListener('click', () => logout());
}

watchAuthState((user) => {
  if (user) {
    renderApp(user.email ?? 'staff');
  } else {
    renderLogin();
  }
});
```

- [ ] **Step 9: Install dependencies**

Run: `npm --prefix web install`
Expected: installs without errors.

- [ ] **Step 10: Manual test**

Copy `web/.env.example` to `web/.env`, fill in your Firebase web app config (Firebase console → Project settings → General → Your apps), create one test user in the Firebase Auth console (Authentication → Users → Add user). Run `npm --prefix web run dev`, open the printed local URL, confirm: (a) logging in with the test user's credentials shows the app shell with nav links, (b) logging in with wrong credentials shows the "Login failed" message, (c) "Log out" returns to the login form.

- [ ] **Step 11: Commit**

```bash
git add web/package.json web/package-lock.json web/tsconfig.json web/vite.config.ts web/index.html web/.env.example web/src/firebaseClient.ts web/src/auth.ts web/src/main.ts
git commit -m "Scaffold staff web app with Firebase Auth login"
```

---

### Task 9: Pure format helpers and ticketApi wrapper

**Files:**
- Create: `web/src/format.ts`
- Test: `web/src/format.test.ts`
- Create: `web/src/ticketApi.ts`
- Test: `web/src/ticketApi.test.ts`

**Interfaces:**
- Consumes: `functions`, `db` (Task 8's `firebaseClient.ts`).
- Produces: `formatItemList(items): string`, `formatTimestamp(seconds): string`, `TicketRecord` type, `validateTicket(ticketId, note?)`, `resendTicketEmail(ticketId)`, `searchTicketsByField(field, value): Promise<TicketRecord[]>` — used by Tasks 10–12.

- [ ] **Step 1: Write the failing test — `web/src/format.test.ts`**

```ts
import { describe, expect, test } from 'vitest';
import { formatItemList, formatTimestamp } from './format';

describe('formatItemList', () => {
  test('joins multiple items with quantities', () => {
    expect(
      formatItemList([
        { name: 'Widget', quantity: 2 },
        { name: 'Gadget', quantity: 1 },
      ]),
    ).toBe('2 x Widget, 1 x Gadget');
  });

  test('returns a message for an empty list', () => {
    expect(formatItemList([])).toBe('No items');
  });
});

describe('formatTimestamp', () => {
  test('formats a unix seconds timestamp as a locale string', () => {
    const result = formatTimestamp(0);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm --prefix web test -- format.test.ts`
Expected: FAIL with "Cannot find module './format'".

- [ ] **Step 3: Implement `web/src/format.ts`**

```ts
export interface FormatItem {
  name: string;
  quantity: number;
}

export function formatItemList(items: FormatItem[]): string {
  if (items.length === 0) return 'No items';
  return items.map((item) => `${item.quantity} x ${item.name}`).join(', ');
}

export function formatTimestamp(seconds: number): string {
  return new Date(seconds * 1000).toLocaleString();
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm --prefix web test -- format.test.ts`
Expected: 3 passed tests.

- [ ] **Step 5: Write the failing test — `web/src/ticketApi.test.ts`**

```ts
import { describe, expect, test, vi } from 'vitest';

vi.mock('./firebaseClient', () => ({ functions: {}, db: {} }));
vi.mock('firebase/functions', () => ({
  httpsCallable: vi.fn(() => vi.fn().mockResolvedValue({ data: { ok: true } })),
}));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  getDocs: vi.fn().mockResolvedValue({
    docs: [{ data: () => ({ ticketId: 't1', status: 'issued' }) }],
  }),
}));

import { validateTicket, searchTicketsByField } from './ticketApi';

describe('validateTicket', () => {
  test('calls the validateTicketCallable with the ticket id', async () => {
    const result = await validateTicket('t1');
    expect(result).toEqual({ ok: true });
  });
});

describe('searchTicketsByField', () => {
  test('returns mapped ticket records from the query snapshot', async () => {
    const results = await searchTicketsByField('customerPhone', '0501234567');
    expect(results).toEqual([{ ticketId: 't1', status: 'issued' }]);
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `npm --prefix web test -- ticketApi.test.ts`
Expected: FAIL with "Cannot find module './ticketApi'".

- [ ] **Step 7: Implement `web/src/ticketApi.ts`**

```ts
import { httpsCallable } from 'firebase/functions';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { functions, db } from './firebaseClient';

export interface TicketRecord {
  ticketId: string;
  status: 'issued' | 'validated';
  customerName: string;
  customerPhone: string | null;
  transactionCode: string;
  items: { name: string; quantity: number }[];
  validatedAt: { seconds: number } | null;
  validatedBy: string | null;
}

export async function validateTicket(ticketId: string, note?: string) {
  const callable = httpsCallable(functions, 'validateTicketCallable');
  const result = await callable({ ticketId, note });
  return result.data;
}

export async function resendTicketEmail(ticketId: string) {
  const callable = httpsCallable(functions, 'resendTicketEmailCallable');
  const result = await callable({ ticketId });
  return result.data;
}

export async function searchTicketsByField(
  field: 'customerName' | 'customerPhone' | 'transactionCode',
  value: string,
): Promise<TicketRecord[]> {
  const q = query(collection(db, 'tickets'), where(field, '==', value));
  const snap = await getDocs(q);
  return snap.docs.map((doc) => doc.data() as TicketRecord);
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `npm --prefix web test -- ticketApi.test.ts`
Expected: 2 passed tests.

- [ ] **Step 9: Commit**

```bash
git add web/src/format.ts web/src/format.test.ts web/src/ticketApi.ts web/src/ticketApi.test.ts
git commit -m "Add format helpers and ticketApi wrapper for the staff web app"
```

---

### Task 10: Scan view

**Files:**
- Create: `web/src/scanView.ts`
- Modify: `web/src/main.ts` (temporary direct call, replaced by routing in Task 12)

**Interfaces:**
- Consumes: `validateTicket` (Task 9), `formatItemList` (Task 9).
- Produces: `renderScanView(container: HTMLElement): void` — used by Task 12's routing.

- [ ] **Step 1: Implement `web/src/scanView.ts`**

```ts
import { Html5Qrcode } from 'html5-qrcode';
import { validateTicket } from './ticketApi';
import { formatItemList } from './format';

export function renderScanView(container: HTMLElement) {
  container.innerHTML = `
    <div id="qr-reader" style="width: 300px;"></div>
    <div id="scan-result"></div>
  `;
  const resultEl = container.querySelector<HTMLDivElement>('#scan-result')!;
  const scanner = new Html5Qrcode('qr-reader');

  scanner.start(
    { facingMode: 'environment' },
    { fps: 10, qrbox: 250 },
    async (decodedText) => {
      await scanner.pause();
      try {
        const data = (await validateTicket(decodedText)) as {
          ok: boolean;
          reason?: string;
          ticket?: { items: { name: string; quantity: number }[] };
        };
        if (data.ok) {
          resultEl.textContent = `Valid ticket. Items: ${formatItemList(data.ticket?.items ?? [])}`;
        } else if (data.reason === 'already_validated') {
          resultEl.textContent = 'This ticket was already picked up.';
        } else {
          resultEl.textContent = 'Ticket not found.';
        }
      } finally {
        scanner.resume();
      }
    },
    () => {
      /* ignore per-frame scan failures — expected while the camera searches for a code */
    },
  );
}
```

- [ ] **Step 2: Temporarily wire it into `web/src/main.ts` for manual testing**

In `renderApp`, after setting `app.innerHTML`, add:

```ts
import { renderScanView } from './scanView';
// ... inside renderApp, after the innerHTML assignment:
renderScanView(document.querySelector<HTMLElement>('#view')!);
```

(This direct call is replaced by hash-based routing in Task 12 — it's here only so Task 10 has an independently testable deliverable.)

- [ ] **Step 3: Manual test**

Run `npm --prefix web run dev`, log in, grant camera permission when prompted. Generate a real ticket by POSTing a test payload to the deployed/emulated `growWebhook` (see Task 5's `webhookHandler.test.ts` for a sample payload shape), get its `ticketId` from the Firestore emulator UI, render it as a QR code (e.g. via `node -e "require('qrcode').toFile('t.png', 'YOUR_TICKET_ID')"` using the `qrcode` package from `functions/node_modules`), and show that image to the camera. Confirm: (a) a fresh ticket shows the item list, (b) scanning it again shows "already picked up", (c) an unrelated random string shows "Ticket not found."

- [ ] **Step 4: Commit**

```bash
git add web/src/scanView.ts web/src/main.ts
git commit -m "Add QR scan view for ticket validation"
```

---

### Task 11: Search / manual-validate view

**Files:**
- Create: `web/src/searchView.ts`
- Modify: `web/src/main.ts` (temporary direct call, replaced by routing in Task 12)

**Interfaces:**
- Consumes: `searchTicketsByField`, `validateTicket`, `TicketRecord` (Task 9), `formatItemList` (Task 9).
- Produces: `renderSearchView(container: HTMLElement): void` — used by Task 12's routing.

- [ ] **Step 1: Implement `web/src/searchView.ts`**

```ts
import { searchTicketsByField, validateTicket, TicketRecord } from './ticketApi';
import { formatItemList } from './format';

export function renderSearchView(container: HTMLElement) {
  container.innerHTML = `
    <select id="search-field">
      <option value="customerName">Name</option>
      <option value="customerPhone">Phone</option>
      <option value="transactionCode">Transaction code</option>
    </select>
    <input id="search-value" placeholder="Search value" />
    <button id="search-button">Search</button>
    <ul id="search-results"></ul>
  `;

  const fieldSelect = container.querySelector<HTMLSelectElement>('#search-field')!;
  const valueInput = container.querySelector<HTMLInputElement>('#search-value')!;
  const resultsList = container.querySelector<HTMLUListElement>('#search-results')!;

  container.querySelector<HTMLButtonElement>('#search-button')!.addEventListener('click', async () => {
    const field = fieldSelect.value as 'customerName' | 'customerPhone' | 'transactionCode';
    const results = await searchTicketsByField(field, valueInput.value);
    renderResults(results);
  });

  function renderResults(results: TicketRecord[]) {
    resultsList.innerHTML = '';
    for (const ticket of results) {
      const li = document.createElement('li');
      const summary = document.createElement('span');
      summary.textContent = `${ticket.customerName} — ${formatItemList(ticket.items)} — ${ticket.status}`;
      li.appendChild(summary);

      if (ticket.status === 'issued') {
        const noteInput = document.createElement('input');
        noteInput.placeholder = 'Verification note (e.g. verified via ID)';
        const confirmButton = document.createElement('button');
        confirmButton.textContent = 'Validate manually';
        confirmButton.addEventListener('click', async () => {
          await validateTicket(ticket.ticketId, noteInput.value);
          summary.textContent += ' — validated';
          noteInput.remove();
          confirmButton.remove();
        });
        li.appendChild(noteInput);
        li.appendChild(confirmButton);
      }
      resultsList.appendChild(li);
    }
  }
}
```

- [ ] **Step 2: Temporarily wire it into `web/src/main.ts` for manual testing**

Replace the temporary `renderScanView(...)` call added in Task 10 with:

```ts
import { renderSearchView } from './searchView';
// ... inside renderApp, after the innerHTML assignment:
renderSearchView(document.querySelector<HTMLElement>('#view')!);
```

- [ ] **Step 3: Manual test**

Run `npm --prefix web run dev`, log in. Create a couple of test tickets via the webhook (as in Task 10). Search by name, phone, and transaction code, confirm matching results appear; click "Validate manually" on an issued ticket with a note, confirm the row updates to show "validated" and the input/button disappear; confirm an already-validated ticket in the results has no validate button.

- [ ] **Step 4: Commit**

```bash
git add web/src/searchView.ts web/src/main.ts
git commit -m "Add manual search and validate view"
```

---

### Task 12: Dashboard view, composite index, and final routing

**Files:**
- Create: `web/src/dashboardView.ts`
- Modify: `firestore.indexes.json`
- Modify: `web/src/main.ts` (final hash-based routing across scan/search/dashboard)

**Interfaces:**
- Consumes: `db` (Task 8), `formatItemList`/`formatTimestamp` (Task 9), `renderScanView` (Task 10), `renderSearchView` (Task 11).
- Produces: `renderDashboardView(container: HTMLElement): Promise<void>`; final `web/src/main.ts` routing.

- [ ] **Step 1: Implement `web/src/dashboardView.ts`**

Per the spec's Error Handling section, tickets whose `emailStatus` is `"failed"` need a "resend email" action here — this is the dashboard's one piece of interactivity beyond filtering.

```ts
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { db } from './firebaseClient';
import { resendTicketEmail } from './ticketApi';
import { formatItemList, formatTimestamp } from './format';

export async function renderDashboardView(container: HTMLElement) {
  container.innerHTML = `
    <select id="status-filter">
      <option value="issued">Issued</option>
      <option value="validated">Validated</option>
    </select>
    <ul id="ticket-list"></ul>
  `;
  const statusFilter = container.querySelector<HTMLSelectElement>('#status-filter')!;
  const list = container.querySelector<HTMLUListElement>('#ticket-list')!;

  async function load() {
    const q = query(collection(db, 'tickets'), where('status', '==', statusFilter.value), orderBy('issuedAt', 'desc'));
    const snap = await getDocs(q);
    list.innerHTML = '';
    snap.forEach((doc) => {
      const ticketId = doc.id;
      const data = doc.data() as {
        customerName: string;
        items: { name: string; quantity: number }[];
        validatedAt: { seconds: number } | null;
        emailStatus: 'sent' | 'failed';
      };
      const li = document.createElement('li');
      const summary = document.createElement('span');
      const validatedText = data.validatedAt ? ` (validated ${formatTimestamp(data.validatedAt.seconds)})` : '';
      summary.textContent = `${data.customerName} — ${formatItemList(data.items)}${validatedText}`;
      li.appendChild(summary);

      if (data.emailStatus === 'failed') {
        const resendButton = document.createElement('button');
        resendButton.textContent = 'Resend email';
        resendButton.addEventListener('click', async () => {
          resendButton.disabled = true;
          const result = (await resendTicketEmail(ticketId)) as { sent: boolean };
          resendButton.textContent = result.sent ? 'Email resent' : 'Resend failed — try again';
          resendButton.disabled = result.sent;
        });
        li.appendChild(resendButton);
      }
      list.appendChild(li);
    });
  }

  statusFilter.addEventListener('change', load);
  await load();
}
```

- [ ] **Step 2: Modify `firestore.indexes.json` to add the dashboard's composite index**

```json
{
  "indexes": [
    {
      "collectionGroup": "tickets",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "status", "order": "ASCENDING" },
        { "fieldPath": "issuedAt", "order": "DESCENDING" }
      ]
    }
  ],
  "fieldOverrides": []
}
```

- [ ] **Step 3: Modify `web/src/main.ts` to its final, complete version with hash routing**

```ts
import { login, logout, watchAuthState } from './auth';
import { renderScanView } from './scanView';
import { renderSearchView } from './searchView';
import { renderDashboardView } from './dashboardView';

const app = document.querySelector<HTMLDivElement>('#app')!;

function renderLogin() {
  app.innerHTML = `
    <form id="login-form">
      <input id="email" type="email" placeholder="Email" required />
      <input id="password" type="password" placeholder="Password" required />
      <button type="submit">Log in</button>
      <p id="login-error" style="color: red;"></p>
    </form>
  `;
  const form = document.querySelector<HTMLFormElement>('#login-form')!;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = document.querySelector<HTMLInputElement>('#email')!.value;
    const password = document.querySelector<HTMLInputElement>('#password')!.value;
    try {
      await login(email, password);
    } catch (error) {
      document.querySelector<HTMLParagraphElement>('#login-error')!.textContent =
        'Login failed. Check your credentials.';
    }
  });
}

function renderApp(userEmail: string) {
  app.innerHTML = `
    <header>
      <span>Logged in as ${userEmail}</span>
      <button id="logout-button">Log out</button>
    </header>
    <nav>
      <a href="#scan">Scan</a>
      <a href="#search">Search</a>
      <a href="#dashboard">Dashboard</a>
    </nav>
    <main id="view"></main>
  `;
  document.querySelector<HTMLButtonElement>('#logout-button')!.addEventListener('click', () => logout());

  function renderRoute() {
    const view = document.querySelector<HTMLElement>('#view')!;
    const route = window.location.hash.replace('#', '') || 'scan';
    if (route === 'scan') renderScanView(view);
    else if (route === 'search') renderSearchView(view);
    else if (route === 'dashboard') renderDashboardView(view);
  }

  window.addEventListener('hashchange', renderRoute);
  renderRoute();
}

watchAuthState((user) => {
  if (user) {
    renderApp(user.email ?? 'staff');
  } else {
    renderLogin();
  }
});
```

- [ ] **Step 4: Manual test**

Run `npm --prefix web run dev`, log in. Create at least two test tickets (one left issued, one validated via the Search view). Click "Dashboard," confirm the "Issued" filter shows only unvalidated tickets and "Validated" shows the other with its validation time. Manually set one ticket's `emailStatus` to `"failed"` in the Firestore emulator UI, reload the Dashboard, and confirm a "Resend email" button appears for it and disappears (replaced by "Email resent") after clicking. Click between "Scan," "Search," and "Dashboard" nav links and confirm each view renders correctly via the URL hash.

- [ ] **Step 5: Commit**

```bash
git add web/src/dashboardView.ts firestore.indexes.json web/src/main.ts
git commit -m "Add dashboard view, composite index, and final view routing"
```

---

### Task 13: Deployment and Grow integration runbook

**Files:**
- Create: `README.md`

**Interfaces:**
- Consumes: nothing (documentation only).
- Produces: a runbook covering the manual, non-code steps needed to go live.

- [ ] **Step 1: Create `README.md`**

```markdown
# Grow Ticketing System

Issues an emailed QR-code pickup ticket when a Grow purchase webhook fires, and lets staff validate tickets at the delivery point. See `docs/superpowers/specs/2026-07-17-grow-ticketing-design.md` for the full design.

## One-time setup

1. Create a Firebase project in the [Firebase console](https://console.firebase.google.com/), enabling Firestore, Authentication (Email/Password provider), Hosting, and Functions (Blaze plan required for outbound network calls from Cloud Functions, e.g. to Resend).
2. Run `firebase use --add` from the repo root and select the new project, replacing the placeholder in `.firebaserc`.
3. Create a [Resend](https://resend.com) account (or another transactional email provider) and get an API key; free tier covers this project's expected volume (100–1,000 emails/month).
4. Contact Grow support (per `https://developers.grow.business/docs/webhooks`) to enable webhooks for your account and get your webhook URL registered. **Ask them directly what the `webhookKey` field in their webhook payloads represents and whether any other request-authenticity mechanism exists** (signature header, IP allowlist) — this project's webhook check assumes `webhookKey` is a static shared secret, which Grow's docs do not explicitly confirm.
5. Set the two required secrets:
   ```bash
   firebase functions:secrets:set GROW_WEBHOOK_KEY
   firebase functions:secrets:set RESEND_API_KEY
   ```
6. Create at least one staff account in Firebase console → Authentication → Users → Add user (email + password). Repeat per staff member — there is no public self-signup by design.
7. Copy `web/.env.example` to `web/.env` and fill in the values from Firebase console → Project settings → General → Your apps → Web app config.

## Local development

- Functions: `npm --prefix functions install`, then `npm --prefix functions run test:emulator` to run the full test suite against the Firestore emulator.
- Web app: `npm --prefix web install`, then `npm --prefix web run dev`.
- Full stack locally: `firebase emulators:start` (serves Functions, Firestore, Auth, and Hosting together).

## Deploying

```bash
npm --prefix functions run build
firebase deploy --only functions,firestore:rules,firestore:indexes,hosting
```

After deploying, give Grow support the deployed `growWebhook` URL (visible in the Firebase console under Functions, or in the CLI output after deploy) to complete their webhook configuration.

## Customizing the ticket email's wording

The email's subject, greeting, QR instructions, and items label are read from the `settings/emailTemplate` document in Firestore, not hardcoded. To customize them, open Firebase console → Firestore → create (or edit) a document at `settings/emailTemplate` with any of these string fields: `subject`, `greeting`, `qrInstructions`, `itemsLabel`. Any field left out keeps its built-in default (see `functions/src/settings.ts`). No redeploy is needed — changes take effect on the next email sent.

## Deferred features (see design spec)

- SMS delivery of the ticket.
- A public, token-gated hosted ticket page (needed to support SMS, since SMS can't embed a QR image directly).
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "Add deployment and Grow integration runbook"
```

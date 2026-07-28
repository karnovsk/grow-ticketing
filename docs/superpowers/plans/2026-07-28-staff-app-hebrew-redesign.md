# Staff App Hebrew Translation & QR Scan Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Translate the staff validation web app (`web/`) to Hebrew (default, with an English toggle and RTL layout), give it real styling, and replace the current auto-validate-on-scan behavior with an explicit preview → confirm pickup flow.

**Architecture:** All changes are confined to `web/`. A new `i18n.ts` module owns language state and string lookup; a new `scanFlow.ts` module owns the scan view's state-transition logic as pure functions (independently testable without mocking the camera); a new `style.css` provides the visual system. `functions/` is untouched — the existing `validateTicketCallable` remains the sole authority for committing a pickup; the new preview step reads tickets directly from Firestore client-side, the same pattern `searchView.ts`/`dashboardView.ts` already use.

**Tech Stack:** TypeScript, Vite, Vitest + jsdom, Firebase Web SDK (Auth/Firestore/Functions), html5-qrcode. No new dependencies.

## Global Constraints

- No changes to `functions/` — `validateTicketCallable`, `resendTicketEmailCallable`, the Firestore data model, and security rules stay exactly as they are today.
- No new npm dependencies — no CSS framework, component library, webfont, or i18n library. Hand-written CSS and a hand-rolled dictionary only.
- Default language is Hebrew (`'he'`), persisted to `localStorage` under key `'lang'`. `document.documentElement.dir` follows the active language (`rtl` for Hebrew, `ltr` for English).
- Mobile-first, responsive layout. The scan view in particular must work one-handed: primary actions reachable near the bottom of the screen, minimum 44px tap targets.
- Every user-facing string in `web/src` goes through the `t()` helper in `i18n.ts` — no hardcoded English or Hebrew literals in view files. Data pulled from Firestore (customer names, item names) is never translated.
- Follow the spec at `docs/superpowers/specs/2026-07-28-staff-app-hebrew-redesign-design.md`.

---

### Task 1: Translation core (`i18n.ts`)

**Files:**
- Create: `web/src/i18n.ts`
- Test: `web/src/i18n.test.ts`

**Interfaces:**
- Produces: `type Lang = 'he' | 'en'`; `type TranslationKey = ...` (41-key union, listed in Step 3); `translations: Record<Lang, Record<TranslationKey, string>>`; `getLang(): Lang`; `setLang(lang: Lang): void`; `t(key: TranslationKey, params?: Record<string, string>): string`; `applyDir(): void`; `localeTag(): 'he-IL' | 'en-US'`.
- Consumes: nothing (foundational module).

- [ ] **Step 1: Write the failing tests**

```typescript
// web/src/i18n.test.ts
import { describe, expect, test, beforeEach } from 'vitest';
import { getLang, setLang, t, applyDir, localeTag, translations, TranslationKey } from './i18n';

describe('translations', () => {
  test('every key has a non-empty value in both languages', () => {
    const heKeys = Object.keys(translations.he).sort();
    const enKeys = Object.keys(translations.en).sort();
    expect(heKeys).toEqual(enKeys);
    for (const key of heKeys) {
      expect(translations.he[key as TranslationKey].length).toBeGreaterThan(0);
      expect(translations.en[key as TranslationKey].length).toBeGreaterThan(0);
    }
  });
});

describe('t', () => {
  beforeEach(() => setLang('en'));

  test('returns the string for the active language', () => {
    setLang('en');
    expect(t('navScan')).toBe('Scan');
    setLang('he');
    expect(t('navScan')).toBe('סריקה');
  });

  test('interpolates {{param}} placeholders', () => {
    setLang('en');
    expect(t('headerLoggedInAs', { email: 'a@b.com' })).toBe('Logged in as a@b.com');
  });
});

describe('getLang/setLang', () => {
  test('persists the active language to localStorage', () => {
    setLang('en');
    expect(localStorage.getItem('lang')).toBe('en');
    expect(getLang()).toBe('en');
  });
});

describe('applyDir', () => {
  test('sets the document lang/dir attributes for the active language', () => {
    setLang('he');
    applyDir();
    expect(document.documentElement.lang).toBe('he');
    expect(document.documentElement.dir).toBe('rtl');

    setLang('en');
    applyDir();
    expect(document.documentElement.lang).toBe('en');
    expect(document.documentElement.dir).toBe('ltr');
  });
});

describe('localeTag', () => {
  test('maps language to a BCP-47 tag', () => {
    setLang('he');
    expect(localeTag()).toBe('he-IL');
    setLang('en');
    expect(localeTag()).toBe('en-US');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm --prefix web test -- i18n`
Expected: FAIL — `./i18n` has no exported members (module doesn't exist yet).

- [ ] **Step 3: Write the implementation**

```typescript
// web/src/i18n.ts
export type Lang = 'he' | 'en';

export type TranslationKey =
  | 'appTitle'
  | 'loginEmailPlaceholder'
  | 'loginPasswordPlaceholder'
  | 'loginButton'
  | 'loginError'
  | 'headerLoggedInAs'
  | 'headerLogoutButton'
  | 'navScan'
  | 'navSearch'
  | 'navDashboard'
  | 'noItems'
  | 'scanInstruction'
  | 'scanLookupError'
  | 'scanRetryButton'
  | 'scanNotFoundTitle'
  | 'scanNotFoundSearchLink'
  | 'scanAgainButton'
  | 'scanConfirmButton'
  | 'scanItemsLabel'
  | 'scanAlreadyPickedUpTitle'
  | 'scanAlreadyPickedUpDetail'
  | 'scanConfirmingButton'
  | 'scanPickedUpTitle'
  | 'scanNextButton'
  | 'scanCameraError'
  | 'searchFieldName'
  | 'searchFieldPhone'
  | 'searchFieldTransaction'
  | 'searchValuePlaceholder'
  | 'searchButton'
  | 'searchNotePlaceholder'
  | 'searchValidateButton'
  | 'searchValidatedSuffix'
  | 'searchAlreadyPickedUpSuffix'
  | 'searchNotFoundSuffix'
  | 'searchErrorSuffix'
  | 'statusIssued'
  | 'statusValidated'
  | 'dashboardValidatedAt'
  | 'dashboardResendButton'
  | 'dashboardResendSuccess'
  | 'dashboardResendFailure';

export const translations: Record<Lang, Record<TranslationKey, string>> = {
  en: {
    appTitle: 'Grow Ticketing — Staff',
    loginEmailPlaceholder: 'Email',
    loginPasswordPlaceholder: 'Password',
    loginButton: 'Log in',
    loginError: 'Login failed. Check your credentials.',
    headerLoggedInAs: 'Logged in as {{email}}',
    headerLogoutButton: 'Log out',
    navScan: 'Scan',
    navSearch: 'Search',
    navDashboard: 'Dashboard',
    noItems: 'No items',
    scanInstruction: 'Point camera at ticket QR',
    scanLookupError: "Couldn't check this ticket. Try again.",
    scanRetryButton: 'Try again',
    scanNotFoundTitle: 'Ticket not found',
    scanNotFoundSearchLink: 'Search manually instead',
    scanAgainButton: 'Scan again',
    scanConfirmButton: 'Confirm pickup',
    scanItemsLabel: 'Items: {{items}}',
    scanAlreadyPickedUpTitle: 'Already picked up',
    scanAlreadyPickedUpDetail: 'Validated {{time}} by {{staff}}',
    scanConfirmingButton: 'Confirming…',
    scanPickedUpTitle: 'Picked up',
    scanNextButton: 'Scan next',
    scanCameraError: 'Could not access the camera. Check camera permissions and try again.',
    searchFieldName: 'Name',
    searchFieldPhone: 'Phone',
    searchFieldTransaction: 'Transaction code',
    searchValuePlaceholder: 'Search value',
    searchButton: 'Search',
    searchNotePlaceholder: 'Verification note (e.g. verified via ID)',
    searchValidateButton: 'Validate manually',
    searchValidatedSuffix: ' — validated',
    searchAlreadyPickedUpSuffix: ' — already picked up (validated by someone else just now)',
    searchNotFoundSuffix: ' — ticket not found',
    searchErrorSuffix: ' — something went wrong, please try again',
    statusIssued: 'Issued',
    statusValidated: 'Picked up',
    dashboardValidatedAt: '(validated {{time}})',
    dashboardResendButton: 'Resend email',
    dashboardResendSuccess: 'Email resent',
    dashboardResendFailure: 'Resend failed — try again',
  },
  he: {
    appTitle: 'כרטיסי Grow – צוות',
    loginEmailPlaceholder: 'אימייל',
    loginPasswordPlaceholder: 'סיסמה',
    loginButton: 'התחברות',
    loginError: 'ההתחברות נכשלה. בדקו את פרטי ההתחברות.',
    headerLoggedInAs: 'מחוברים כ-{{email}}',
    headerLogoutButton: 'התנתקות',
    navScan: 'סריקה',
    navSearch: 'חיפוש',
    navDashboard: 'לוח בקרה',
    noItems: 'אין פריטים',
    scanInstruction: 'כוונו את המצלמה לקוד ה-QR של הכרטיס',
    scanLookupError: 'לא ניתן היה לבדוק את הכרטיס. נסו שוב.',
    scanRetryButton: 'נסו שוב',
    scanNotFoundTitle: 'הכרטיס לא נמצא',
    scanNotFoundSearchLink: 'חיפוש ידני במקום זאת',
    scanAgainButton: 'סרקו שוב',
    scanConfirmButton: 'אישור מסירה',
    scanItemsLabel: 'פריטים: {{items}}',
    scanAlreadyPickedUpTitle: 'כבר נמסר',
    scanAlreadyPickedUpDetail: 'אושר ב-{{time}} על ידי {{staff}}',
    scanConfirmingButton: 'מאשר…',
    scanPickedUpTitle: 'נמסר',
    scanNextButton: 'לסריקה הבאה',
    scanCameraError: 'לא ניתן לגשת למצלמה. בדקו את הרשאות המצלמה ונסו שוב.',
    searchFieldName: 'שם',
    searchFieldPhone: 'טלפון',
    searchFieldTransaction: 'קוד עסקה',
    searchValuePlaceholder: 'ערך לחיפוש',
    searchButton: 'חיפוש',
    searchNotePlaceholder: 'הערת אימות (למשל: אומת לפי ת.ז.)',
    searchValidateButton: 'אישור ידני',
    searchValidatedSuffix: ' — אושר',
    searchAlreadyPickedUpSuffix: ' — כבר נמסר (אושר על ידי איש צוות אחר הרגע)',
    searchNotFoundSuffix: ' — הכרטיס לא נמצא',
    searchErrorSuffix: ' — משהו השתבש, נסו שוב',
    statusIssued: 'הונפק',
    statusValidated: 'נמסר',
    dashboardValidatedAt: '(נמסר ב-{{time}})',
    dashboardResendButton: 'שליחה חוזרת של האימייל',
    dashboardResendSuccess: 'האימייל נשלח מחדש',
    dashboardResendFailure: 'השליחה נכשלה — נסו שוב',
  },
};

const STORAGE_KEY = 'lang';

let currentLang: Lang = localStorage.getItem(STORAGE_KEY) === 'en' ? 'en' : 'he';

export function getLang(): Lang {
  return currentLang;
}

export function setLang(lang: Lang): void {
  currentLang = lang;
  localStorage.setItem(STORAGE_KEY, lang);
}

export function t(key: TranslationKey, params?: Record<string, string>): string {
  const template = translations[currentLang][key];
  if (!params) return template;
  return Object.entries(params).reduce(
    (text, [name, value]) => text.split(`{{${name}}}`).join(value),
    template,
  );
}

export function applyDir(): void {
  document.documentElement.lang = currentLang;
  document.documentElement.dir = currentLang === 'he' ? 'rtl' : 'ltr';
  document.title = t('appTitle');
}

export function localeTag(): 'he-IL' | 'en-US' {
  return currentLang === 'he' ? 'he-IL' : 'en-US';
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --prefix web test -- i18n`
Expected: PASS (all `i18n.test.ts` suites green).

- [ ] **Step 5: Commit**

```bash
git add web/src/i18n.ts web/src/i18n.test.ts
git commit -m "feat: add Hebrew/English translation core (i18n.ts)"
```

---

### Task 2: Locale-aware formatting (`format.ts`)

**Files:**
- Modify: `web/src/format.ts`
- Modify: `web/src/format.test.ts`

**Interfaces:**
- Consumes: `t`, `localeTag` from `./i18n` (Task 1).
- Produces: `formatItemList(items: FormatItem[]): string` (unchanged signature, now translated/locale-aware); `formatTimestamp(seconds: number): string` (unchanged signature, now locale-aware).

- [ ] **Step 1: Write the failing tests**

```typescript
// web/src/format.test.ts
import { describe, expect, test } from 'vitest';
import { formatItemList, formatTimestamp } from './format';
import { setLang } from './i18n';

describe('formatItemList', () => {
  test('joins multiple items with quantities', () => {
    setLang('en');
    expect(
      formatItemList([
        { name: 'Widget', quantity: 2 },
        { name: 'Gadget', quantity: 1 },
      ]),
    ).toBe('2 × Widget, 1 × Gadget');
  });

  test('returns a translated message for an empty list', () => {
    setLang('en');
    expect(formatItemList([])).toBe('No items');
    setLang('he');
    expect(formatItemList([])).toBe('אין פריטים');
  });
});

describe('formatTimestamp', () => {
  test('formats a unix seconds timestamp using the active locale', () => {
    setLang('en');
    const enResult = formatTimestamp(0);
    expect(typeof enResult).toBe('string');
    expect(enResult.length).toBeGreaterThan(0);

    setLang('he');
    const heResult = formatTimestamp(0);
    expect(typeof heResult).toBe('string');
    expect(heResult.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm --prefix web test -- format`
Expected: FAIL — item separator is still `x` not `×`, and empty-list message is hardcoded English regardless of `setLang('he')`.

- [ ] **Step 3: Write the implementation**

```typescript
// web/src/format.ts
import { t, localeTag } from './i18n';

export interface FormatItem {
  name: string;
  quantity: number;
}

export function formatItemList(items: FormatItem[]): string {
  if (items.length === 0) return t('noItems');
  return items.map((item) => `${item.quantity} × ${item.name}`).join(', ');
}

export function formatTimestamp(seconds: number): string {
  return new Date(seconds * 1000).toLocaleString(localeTag());
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --prefix web test -- format`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/format.ts web/src/format.test.ts
git commit -m "feat: make formatItemList/formatTimestamp locale-aware"
```

---

### Task 3: Read-only ticket lookup (`ticketApi.ts`)

**Files:**
- Modify: `web/src/ticketApi.ts`
- Modify: `web/src/ticketApi.test.ts`

**Interfaces:**
- Consumes: `db` from `./firebaseClient`; `doc`, `getDoc` from `firebase/firestore`.
- Produces: `getTicketById(ticketId: string): Promise<TicketRecord | null>` — a direct client-side Firestore read (no new Cloud Function), returning `null` when the document doesn't exist.

- [ ] **Step 1: Write the failing tests**

```typescript
// web/src/ticketApi.test.ts
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
  doc: vi.fn(),
  getDoc: vi.fn().mockResolvedValue({
    exists: () => true,
    data: () => ({ ticketId: 't1', status: 'issued' }),
  }),
}));

import { getDoc } from 'firebase/firestore';
import { validateTicket, searchTicketsByField, getTicketById } from './ticketApi';

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

describe('getTicketById', () => {
  test('returns the ticket data when the document exists', async () => {
    const result = await getTicketById('t1');
    expect(result).toEqual({ ticketId: 't1', status: 'issued' });
  });

  test('returns null when the document does not exist', async () => {
    vi.mocked(getDoc).mockResolvedValueOnce({ exists: () => false, data: () => undefined } as never);
    const result = await getTicketById('missing');
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm --prefix web test -- ticketApi`
Expected: FAIL — `getTicketById` is not exported yet.

- [ ] **Step 3: Write the implementation**

```typescript
// web/src/ticketApi.ts
import { httpsCallable } from 'firebase/functions';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
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

export async function getTicketById(ticketId: string): Promise<TicketRecord | null> {
  const snap = await getDoc(doc(db, 'tickets', ticketId));
  return snap.exists() ? (snap.data() as TicketRecord) : null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --prefix web test -- ticketApi`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/ticketApi.ts web/src/ticketApi.test.ts
git commit -m "feat: add getTicketById for read-only scan preview lookups"
```

---

### Task 4: Scan flow state machine (`scanFlow.ts`)

**Files:**
- Create: `web/src/scanFlow.ts`
- Test: `web/src/scanFlow.test.ts`

**Interfaces:**
- Consumes: `TicketRecord` type from `./ticketApi` (Task 3).
- Produces: `type ScanState` (discriminated union covering `scanning`, `lookupError`, `previewNotFound`, `preview`, `previewAlreadyValidated`, `confirming`, `result`, `resultAlreadyValidated`); `resolveLookup(ticket: TicketRecord | null): ScanState`; `type ConfirmOutcome = { ok: boolean; reason?: string }`; `resolveConfirmOutcome(outcome: ConfirmOutcome): 'result' | 'resultAlreadyValidated' | 'previewNotFound'`.

This module is pure — no DOM, no Firebase, no camera — so the scan flow's branching logic gets real automated test coverage even though the surrounding `scanView.ts` (camera + DOM) does not.

- [ ] **Step 1: Write the failing tests**

```typescript
// web/src/scanFlow.test.ts
import { describe, expect, test } from 'vitest';
import { resolveLookup, resolveConfirmOutcome } from './scanFlow';
import { TicketRecord } from './ticketApi';

const issuedTicket: TicketRecord = {
  ticketId: 't1',
  status: 'issued',
  customerName: 'Dana Levi',
  customerPhone: null,
  transactionCode: 'tx1',
  items: [{ name: 'Widget', quantity: 1 }],
  validatedAt: null,
  validatedBy: null,
};

const validatedTicket: TicketRecord = { ...issuedTicket, status: 'validated' };

describe('resolveLookup', () => {
  test('returns previewNotFound when no ticket exists', () => {
    expect(resolveLookup(null)).toEqual({ phase: 'previewNotFound' });
  });

  test('returns previewAlreadyValidated for an already-validated ticket', () => {
    expect(resolveLookup(validatedTicket)).toEqual({
      phase: 'previewAlreadyValidated',
      ticket: validatedTicket,
    });
  });

  test('returns preview for an issued ticket', () => {
    expect(resolveLookup(issuedTicket)).toEqual({ phase: 'preview', ticket: issuedTicket });
  });
});

describe('resolveConfirmOutcome', () => {
  test('returns result on success', () => {
    expect(resolveConfirmOutcome({ ok: true })).toBe('result');
  });

  test('returns resultAlreadyValidated on a race condition', () => {
    expect(resolveConfirmOutcome({ ok: false, reason: 'already_validated' })).toBe('resultAlreadyValidated');
  });

  test('returns previewNotFound for any other failure reason', () => {
    expect(resolveConfirmOutcome({ ok: false, reason: 'not_found' })).toBe('previewNotFound');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm --prefix web test -- scanFlow`
Expected: FAIL — `./scanFlow` doesn't exist yet.

- [ ] **Step 3: Write the implementation**

```typescript
// web/src/scanFlow.ts
import { TicketRecord } from './ticketApi';

export type ScanState =
  | { phase: 'scanning' }
  | { phase: 'lookupError' }
  | { phase: 'previewNotFound' }
  | { phase: 'preview'; ticket: TicketRecord }
  | { phase: 'previewAlreadyValidated'; ticket: TicketRecord }
  | { phase: 'confirming'; ticket: TicketRecord }
  | { phase: 'result'; ticket: TicketRecord }
  | { phase: 'resultAlreadyValidated'; ticket: TicketRecord };

export function resolveLookup(ticket: TicketRecord | null): ScanState {
  if (!ticket) return { phase: 'previewNotFound' };
  if (ticket.status === 'validated') return { phase: 'previewAlreadyValidated', ticket };
  return { phase: 'preview', ticket };
}

export type ConfirmOutcome = { ok: boolean; reason?: string };

export function resolveConfirmOutcome(
  outcome: ConfirmOutcome,
): 'result' | 'resultAlreadyValidated' | 'previewNotFound' {
  if (outcome.ok) return 'result';
  if (outcome.reason === 'already_validated') return 'resultAlreadyValidated';
  return 'previewNotFound';
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --prefix web test -- scanFlow`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/scanFlow.ts web/src/scanFlow.test.ts
git commit -m "feat: add pure scan-flow state machine (preview/confirm)"
```

---

### Task 5: Global stylesheet & HTML shell defaults

**Files:**
- Create: `web/src/style.css`
- Modify: `web/index.html`

**Interfaces:**
- Produces CSS classes consumed by later tasks: `.btn`, `.btn-primary`, `.btn-secondary`, `.btn-block`, `.card`, `.card-neutral`, `.card-success`, `.card-warning`, `.card-error`, `.pill`, `.pill-issued`, `.pill-validated`, `.ticket-list`, `.search-controls`, `.header-actions`, `.field-error`, `.lang-toggle`, `.scan-instruction`, `#qr-reader`.
- No automated test (CSS has no runtime logic) — verified by building the app (Step 3) and visually in Task 10's manual pass.

- [ ] **Step 1: Write the stylesheet**

```css
/* web/src/style.css */
:root {
  --color-bg: #f5f5f4;
  --color-surface: #ffffff;
  --color-text: #1c1917;
  --color-muted: #78716c;
  --color-primary: #2563eb;
  --color-success: #16a34a;
  --color-warning: #d97706;
  --color-error: #dc2626;
  --radius: 12px;
  --spacing: 1rem;
  font-family: system-ui, -apple-system, 'Segoe UI', Arial, sans-serif;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: var(--color-bg);
  color: var(--color-text);
  min-height: 100vh;
}

#app {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing);
  padding: 0.75rem 1rem;
  background: var(--color-surface);
  border-block-end: 1px solid #e7e5e4;
}

.header-actions {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.lang-toggle {
  border: 1px solid #d6d3d1;
  background: transparent;
  border-radius: 999px;
  padding: 0.25rem 0.75rem;
  font-size: 0.85rem;
  cursor: pointer;
  min-height: 32px;
}

nav {
  display: flex;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  background: var(--color-surface);
  border-block-end: 1px solid #e7e5e4;
}

nav a {
  padding: 0.5rem 0.75rem;
  border-radius: var(--radius);
  text-decoration: none;
  color: var(--color-text);
  font-weight: 600;
}

nav a:hover,
nav a:focus-visible {
  background: var(--color-bg);
}

main {
  flex: 1;
  padding: 1rem;
  max-width: 480px;
  width: 100%;
  margin-inline: auto;
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  padding: 0.6rem 1.25rem;
  border-radius: var(--radius);
  border: none;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-primary {
  background: var(--color-primary);
  color: #fff;
}

.btn-secondary {
  background: var(--color-surface);
  color: var(--color-text);
  border: 1px solid #d6d3d1;
}

.btn-block {
  width: 100%;
}

input,
select {
  width: 100%;
  min-height: 44px;
  padding: 0.5rem 0.75rem;
  border-radius: var(--radius);
  border: 1px solid #d6d3d1;
  font-size: 1rem;
  background: var(--color-surface);
  color: var(--color-text);
}

.field-error {
  color: var(--color-error);
  font-size: 0.9rem;
}

.card {
  background: var(--color-surface);
  border-radius: var(--radius);
  padding: 1.25rem;
  margin-block-start: 1rem;
  border-inline-start: 6px solid var(--color-muted);
}

.card-neutral {
  border-inline-start-color: var(--color-primary);
}

.card-success {
  border-inline-start-color: var(--color-success);
}

.card-warning {
  border-inline-start-color: var(--color-warning);
}

.card-error {
  border-inline-start-color: var(--color-error);
}

.card p {
  margin-block: 0;
}

.card .actions {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-block-start: 1rem;
}

.pill {
  display: inline-block;
  padding: 0.2rem 0.6rem;
  border-radius: 999px;
  font-size: 0.8rem;
  font-weight: 600;
  color: #fff;
}

.pill-issued {
  background: var(--color-primary);
}

.pill-validated {
  background: var(--color-success);
}

#qr-reader {
  width: min(90vw, 400px);
  aspect-ratio: 1 / 1;
  margin-inline: auto;
  overflow: hidden;
  border-radius: var(--radius);
}

.scan-instruction {
  text-align: center;
  color: var(--color-muted);
  margin-block-start: 0.75rem;
}

.ticket-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.ticket-list li {
  background: var(--color-surface);
  border-radius: var(--radius);
  padding: 0.75rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.search-controls {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-block-end: 1rem;
}

@media (min-width: 720px) {
  main {
    max-width: 720px;
  }

  .search-controls {
    flex-direction: row;
  }

  .search-controls input,
  .search-controls select {
    width: auto;
    flex: 1;
  }
}
```

- [ ] **Step 2: Update the HTML shell defaults**

```html
<!-- web/index.html -->
<!doctype html>
<html lang="he" dir="rtl">
  <head>
    <meta charset="UTF-8" />
    <title>כרטיסי Grow – צוות</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 3: Verify the app builds**

Run: `npm --prefix web run build`
Expected: build succeeds (no TypeScript/CSS errors). `style.css` is not imported anywhere yet, so it won't appear in the bundle until Task 6 — that's expected.

- [ ] **Step 4: Commit**

```bash
git add web/src/style.css web/index.html
git commit -m "feat: add global stylesheet and default Hebrew/RTL HTML shell"
```

---

### Task 6: Scan view redesign (`scanView.ts`)

**Files:**
- Modify: `web/src/scanView.ts`

**Interfaces:**
- Consumes: `Html5Qrcode` from `html5-qrcode`; `validateTicket`, `getTicketById`, `TicketRecord` from `./ticketApi` (Task 3); `formatItemList`, `formatTimestamp` from `./format` (Task 2); `t` from `./i18n` (Task 1); `ScanState`, `resolveLookup`, `resolveConfirmOutcome` from `./scanFlow` (Task 4).
- Produces: `interface ScanViewHandle { stop: () => void; retranslate: () => void }`; `renderScanView(container: HTMLElement): ScanViewHandle`. This replaces the previous bare-cleanup-function signature — Task 7 (`main.ts`) calls `.stop()` on route change and `.retranslate()` on a language toggle, so the camera stream is only ever touched by `.stop()`, never by a translation change.

There's no existing `scanView.test.ts` (camera/DOM logic isn't unit-tested in this project today; the branching logic itself is already covered by `scanFlow.test.ts` in Task 4). This task's verification is the manual check in Step 2.

- [ ] **Step 1: Rewrite `scanView.ts`**

```typescript
// web/src/scanView.ts
import { Html5Qrcode } from 'html5-qrcode';
import { validateTicket, getTicketById, TicketRecord } from './ticketApi';
import { formatItemList, formatTimestamp } from './format';
import { t } from './i18n';
import { ScanState, resolveLookup, resolveConfirmOutcome } from './scanFlow';

export interface ScanViewHandle {
  stop: () => void;
  retranslate: () => void;
}

export function renderScanView(container: HTMLElement): ScanViewHandle {
  let state: ScanState = { phase: 'scanning' };
  let lastScannedId: string | null = null;
  let autoResumeTimer: ReturnType<typeof setTimeout> | null = null;

  container.innerHTML = `
    <div id="qr-reader"></div>
    <p id="scan-instruction" class="scan-instruction"></p>
    <div id="scan-result"></div>
  `;
  const resultEl = container.querySelector<HTMLDivElement>('#scan-result')!;
  const instructionEl = container.querySelector<HTMLParagraphElement>('#scan-instruction')!;
  const scanner = new Html5Qrcode('qr-reader');

  function button(label: string, onClick: () => void, className = 'btn-secondary', disabled = false) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = `btn ${className}`;
    el.textContent = label;
    el.disabled = disabled;
    el.addEventListener('click', onClick);
    return el;
  }

  function renderCard(variant: string, text: string, buttons: HTMLButtonElement[]) {
    resultEl.innerHTML = '';
    const card = document.createElement('div');
    card.className = `card ${variant}`;
    const heading = document.createElement('p');
    heading.textContent = text;
    card.appendChild(heading);
    const actions = document.createElement('div');
    actions.className = 'actions';
    buttons.forEach((b) => actions.appendChild(b));
    card.appendChild(actions);
    resultEl.appendChild(card);
  }

  function scheduleAutoResume() {
    if (autoResumeTimer) clearTimeout(autoResumeTimer);
    autoResumeTimer = setTimeout(resumeScanning, 3000);
  }

  function resumeScanning() {
    if (autoResumeTimer) {
      clearTimeout(autoResumeTimer);
      autoResumeTimer = null;
    }
    state = { phase: 'scanning' };
    render();
    scanner.resume();
  }

  function itemsLine(ticket: TicketRecord): string {
    return t('scanItemsLabel', { items: formatItemList(ticket.items) });
  }

  function render() {
    instructionEl.textContent = state.phase === 'scanning' ? t('scanInstruction') : '';

    if (state.phase === 'scanning') {
      resultEl.innerHTML = '';
    } else if (state.phase === 'lookupError') {
      renderCard('card-error', t('scanLookupError'), [
        button(t('scanRetryButton'), () => lastScannedId && lookUp(lastScannedId)),
      ]);
    } else if (state.phase === 'previewNotFound') {
      renderCard('card-error', t('scanNotFoundTitle'), [
        button(t('scanAgainButton'), resumeScanning),
        button(t('scanNotFoundSearchLink'), () => {
          window.location.hash = 'search';
        }),
      ]);
    } else if (state.phase === 'preview') {
      renderCard('card-neutral', `${state.ticket.customerName} — ${itemsLine(state.ticket)}`, [
        button(t('scanConfirmButton'), () => confirm(state.ticket), 'btn-primary'),
        button(t('scanAgainButton'), resumeScanning),
      ]);
    } else if (state.phase === 'previewAlreadyValidated') {
      const detail = t('scanAlreadyPickedUpDetail', {
        time: state.ticket.validatedAt ? formatTimestamp(state.ticket.validatedAt.seconds) : '',
        staff: state.ticket.validatedBy ?? '',
      });
      renderCard('card-warning', `${t('scanAlreadyPickedUpTitle')} — ${detail}`, [
        button(t('scanAgainButton'), resumeScanning),
      ]);
    } else if (state.phase === 'confirming') {
      renderCard('card-neutral', `${state.ticket.customerName} — ${itemsLine(state.ticket)}`, [
        button(t('scanConfirmingButton'), () => {}, 'btn-primary', true),
      ]);
    } else if (state.phase === 'result') {
      renderCard('card-success', `${t('scanPickedUpTitle')} — ${itemsLine(state.ticket)}`, [
        button(t('scanNextButton'), resumeScanning),
      ]);
      scheduleAutoResume();
    } else if (state.phase === 'resultAlreadyValidated') {
      renderCard('card-warning', t('scanAlreadyPickedUpTitle'), [button(t('scanNextButton'), resumeScanning)]);
      scheduleAutoResume();
    }
  }

  async function lookUp(ticketId: string) {
    lastScannedId = ticketId;
    try {
      const ticket = await getTicketById(ticketId);
      state = resolveLookup(ticket);
    } catch {
      state = { phase: 'lookupError' };
    }
    render();
  }

  async function confirm(ticket: TicketRecord) {
    state = { phase: 'confirming', ticket };
    render();
    try {
      const outcome = (await validateTicket(ticket.ticketId)) as { ok: boolean; reason?: string };
      const nextPhase = resolveConfirmOutcome(outcome);
      if (nextPhase === 'resultAlreadyValidated') {
        const fresh = await getTicketById(ticket.ticketId);
        state = { phase: 'resultAlreadyValidated', ticket: fresh ?? ticket };
      } else if (nextPhase === 'result') {
        state = { phase: 'result', ticket };
      } else {
        state = { phase: 'previewNotFound' };
      }
    } catch {
      state = { phase: 'lookupError' };
    }
    render();
  }

  render();

  scanner
    .start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: 250 },
      async (decodedText) => {
        if (state.phase !== 'scanning') return;
        await scanner.pause();
        await lookUp(decodedText);
      },
      () => {
        /* ignore per-frame scan failures — expected while the camera searches for a code */
      },
    )
    .catch(() => {
      resultEl.innerHTML = `<div class="card card-error"><p>${t('scanCameraError')}</p></div>`;
    });

  return {
    stop: () => {
      // Release the camera when navigating away — without this, the stream
      // keeps running (browser camera indicator stays lit, battery drains),
      // and a second Html5Qrcode instance would conflict with it if the user
      // navigates back to Scan. stop() *throws synchronously* (not just a
      // rejected promise) if the scanner never reached a running/paused
      // state — e.g. navigated away before start() resolved, or start()
      // already failed (denied permission, no camera) — so this needs a
      // try/catch around the call itself, not just a .catch() on its result.
      if (autoResumeTimer) clearTimeout(autoResumeTimer);
      try {
        scanner.stop().catch(() => {});
      } catch {
        /* scanner never started — nothing to stop */
      }
    },
    retranslate: () => {
      // Re-draws whatever card is currently shown in the new language.
      // Never touches `scanner` — the camera stream keeps running undisturbed.
      render();
    },
  };
}
```

- [ ] **Step 2: Manually verify in the dev server**

Run: `npm --prefix web run dev` (on a phone or a laptop with a webcam, over HTTPS or `localhost` so camera permission is granted).
Expected, walking through each path:
- Scanning a QR for an `issued` ticket shows the neutral preview card with customer name + items, and tapping "אישור מסירה" (Confirm pickup) shows the green "נמסר" (Picked up) result, then auto-returns to scanning after ~3s.
- Scanning the same QR again shows the amber "כבר נמסר" (Already picked up) card with the validation time and staff UID, offering only "סרקו שוב".
- Scanning gibberish/an unrelated QR shows the red "הכרטיס לא נמצא" (Ticket not found) card with both "סרקו שוב" and a link into Search.
- Toggling to English mid-flow re-renders the current card's text in English without restarting the camera.

- [ ] **Step 3: Commit**

```bash
git add web/src/scanView.ts
git commit -m "feat: redesign scan flow with explicit preview/confirm step"
```

---

### Task 7: App shell — login, header, nav, language toggle (`main.ts`)

**Files:**
- Modify: `web/src/main.ts`

**Interfaces:**
- Consumes: `t`, `getLang`, `setLang`, `applyDir`, `Lang` from `./i18n` (Task 1); `./style.css` (Task 5, imported for its side effect of injecting styles); `ScanViewHandle`, `renderScanView` from `./scanView` (Task 6).
- Produces: no new exports — `main.ts` is the app's entry point, not imported elsewhere.

There's no existing `main.test.ts` (the project doesn't unit-test DOM entry points — `auth.ts`/`main.ts` have none today), so this task's verification is the manual dev-server check in Step 2, consistent with the existing test coverage boundary.

**Why not just re-render everything on toggle:** the simplest implementation would call the same full `renderApp()`/`renderLogin()` used on login, on every language toggle. But when the scan view is mounted, that tears down and recreates the `Html5Qrcode` scanner — silently restarting the camera stream mid-scan, which the spec explicitly rules out ("Toggling language never restarts the camera stream if the scan view is active"). Instead, the toggle updates header/nav text in place and, when on the scan route, calls the scan view's `retranslate()` handle (from Task 6) instead of remounting it.

- [ ] **Step 1: Rewrite `main.ts`**

```typescript
// web/src/main.ts
import './style.css';
import { login, logout, watchAuthState } from './auth';
import { renderScanView, ScanViewHandle } from './scanView';
import { renderSearchView } from './searchView';
import { renderDashboardView } from './dashboardView';
import { t, getLang, setLang, applyDir, Lang } from './i18n';

const app = document.querySelector<HTMLDivElement>('#app')!;

let scanHandle: ScanViewHandle | null = null;
let hashListenerAttached = false;
let currentUserEmail: string | null = null;
let currentRoute: 'scan' | 'search' | 'dashboard' = 'scan';

applyDir();

function renderRoute() {
  const view = document.querySelector<HTMLElement>('#view');
  if (!view) return;
  if (scanHandle) {
    scanHandle.stop();
    scanHandle = null;
  }
  currentRoute = (window.location.hash.replace('#', '') || 'scan') as 'scan' | 'search' | 'dashboard';
  if (currentRoute === 'scan') scanHandle = renderScanView(view);
  else if (currentRoute === 'search') renderSearchView(view);
  else if (currentRoute === 'dashboard') renderDashboardView(view);
}

function langToggleLabel(): string {
  return getLang() === 'he' ? 'EN' : 'עב';
}

function retranslateHeader() {
  const langButton = document.querySelector<HTMLButtonElement>('#lang-toggle');
  if (langButton) langButton.textContent = langToggleLabel();
  if (!currentUserEmail) return;
  const headerLabel = document.querySelector<HTMLSpanElement>('#header-label');
  if (headerLabel) headerLabel.textContent = t('headerLoggedInAs', { email: currentUserEmail });
  const logoutButton = document.querySelector<HTMLButtonElement>('#logout-button');
  if (logoutButton) logoutButton.textContent = t('headerLogoutButton');
  const navScan = document.querySelector<HTMLAnchorElement>('a[href="#scan"]');
  if (navScan) navScan.textContent = t('navScan');
  const navSearch = document.querySelector<HTMLAnchorElement>('a[href="#search"]');
  if (navSearch) navSearch.textContent = t('navSearch');
  const navDashboard = document.querySelector<HTMLAnchorElement>('a[href="#dashboard"]');
  if (navDashboard) navDashboard.textContent = t('navDashboard');
}

function toggleLang() {
  const next: Lang = getLang() === 'he' ? 'en' : 'he';
  setLang(next);
  applyDir();
  if (!currentUserEmail) {
    renderLogin();
    return;
  }
  retranslateHeader();
  if (currentRoute === 'scan' && scanHandle) {
    scanHandle.retranslate();
  } else {
    renderRoute();
  }
}

function renderLogin() {
  if (scanHandle) {
    scanHandle.stop();
    scanHandle = null;
  }
  app.innerHTML = `
    <header>
      <span></span>
      <button id="lang-toggle" class="lang-toggle" type="button">${langToggleLabel()}</button>
    </header>
    <form id="login-form">
      <input id="email" type="email" placeholder="${t('loginEmailPlaceholder')}" required />
      <input id="password" type="password" placeholder="${t('loginPasswordPlaceholder')}" required />
      <button type="submit" class="btn btn-primary btn-block">${t('loginButton')}</button>
      <p id="login-error" class="field-error"></p>
    </form>
  `;
  document.querySelector<HTMLButtonElement>('#lang-toggle')!.addEventListener('click', toggleLang);
  const form = document.querySelector<HTMLFormElement>('#login-form')!;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = document.querySelector<HTMLInputElement>('#email')!.value;
    const password = document.querySelector<HTMLInputElement>('#password')!.value;
    try {
      await login(email, password);
    } catch (error) {
      document.querySelector<HTMLParagraphElement>('#login-error')!.textContent = t('loginError');
    }
  });
}

function renderApp(userEmail: string) {
  currentUserEmail = userEmail;
  app.innerHTML = `
    <header>
      <span id="header-label">${t('headerLoggedInAs', { email: userEmail })}</span>
      <div class="header-actions">
        <button id="lang-toggle" class="lang-toggle" type="button">${langToggleLabel()}</button>
        <button id="logout-button" class="btn btn-secondary">${t('headerLogoutButton')}</button>
      </div>
    </header>
    <nav>
      <a href="#scan">${t('navScan')}</a>
      <a href="#search">${t('navSearch')}</a>
      <a href="#dashboard">${t('navDashboard')}</a>
    </nav>
    <main id="view"></main>
  `;
  document.querySelector<HTMLButtonElement>('#lang-toggle')!.addEventListener('click', toggleLang);
  document.querySelector<HTMLButtonElement>('#logout-button')!.addEventListener('click', () => logout());

  if (!hashListenerAttached) {
    window.addEventListener('hashchange', renderRoute);
    hashListenerAttached = true;
  }
  renderRoute();
}

watchAuthState((user) => {
  if (user) {
    renderApp(user.email ?? 'staff');
  } else {
    currentUserEmail = null;
    renderLogin();
  }
});
```

- [ ] **Step 2: Manually verify in the dev server**

Run: `npm --prefix web run dev`, open the printed local URL.
Expected: page loads RTL with Hebrew login form ("אימייל" / "סיסמה" / "התחברות"); the "EN" pill in the header toggles the login form to English and flips the page to LTR; after logging in, header shows "מחוברים כ-&lt;email&gt;" / "התנתקות" and nav shows "סריקה" / "חיפוש" / "לוח בקרה", all mirrored RTL, with the toggle switching the whole app to English and back. While on the Scan tab, confirm the camera preview does **not** flicker/restart when toggling language (open the browser's camera-in-use indicator and watch it stay solid through a toggle).

- [ ] **Step 3: Commit**

```bash
git add web/src/main.ts
git commit -m "feat: translate login/header/nav and add Hebrew/English toggle"
```

---

### Task 8: Search view translation & polish (`searchView.ts`)

**Files:**
- Modify: `web/src/searchView.ts`

**Interfaces:**
- Consumes: `searchTicketsByField`, `validateTicket`, `TicketRecord` from `./ticketApi`; `formatItemList` from `./format`; `t` from `./i18n`.
- Produces: `renderSearchView(container: HTMLElement): void` (unchanged signature).

No existing `searchView.test.ts` today; verified manually in Step 2.

- [ ] **Step 1: Rewrite `searchView.ts`**

```typescript
// web/src/searchView.ts
import { searchTicketsByField, validateTicket, TicketRecord } from './ticketApi';
import { formatItemList } from './format';
import { t } from './i18n';

export function renderSearchView(container: HTMLElement) {
  container.innerHTML = `
    <div class="search-controls">
      <select id="search-field">
        <option value="customerName">${t('searchFieldName')}</option>
        <option value="customerPhone">${t('searchFieldPhone')}</option>
        <option value="transactionCode">${t('searchFieldTransaction')}</option>
      </select>
      <input id="search-value" placeholder="${t('searchValuePlaceholder')}" />
      <button id="search-button" class="btn btn-primary">${t('searchButton')}</button>
    </div>
    <ul id="search-results" class="ticket-list"></ul>
  `;

  const fieldSelect = container.querySelector<HTMLSelectElement>('#search-field')!;
  const valueInput = container.querySelector<HTMLInputElement>('#search-value')!;
  const resultsList = container.querySelector<HTMLUListElement>('#search-results')!;

  async function runSearch() {
    const field = fieldSelect.value as 'customerName' | 'customerPhone' | 'transactionCode';
    const results = await searchTicketsByField(field, valueInput.value);
    renderResults(results);
  }

  container.querySelector<HTMLButtonElement>('#search-button')!.addEventListener('click', runSearch);
  valueInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') runSearch();
  });

  function renderResults(results: TicketRecord[]) {
    resultsList.innerHTML = '';
    for (const ticket of results) {
      const li = document.createElement('li');
      const summary = document.createElement('span');
      summary.textContent = `${ticket.customerName} — ${formatItemList(ticket.items)} `;
      const pill = document.createElement('span');
      pill.className = `pill ${ticket.status === 'validated' ? 'pill-validated' : 'pill-issued'}`;
      pill.textContent = t(ticket.status === 'validated' ? 'statusValidated' : 'statusIssued');
      summary.appendChild(pill);
      li.appendChild(summary);

      if (ticket.status === 'issued') {
        const noteInput = document.createElement('input');
        noteInput.placeholder = t('searchNotePlaceholder');
        const confirmButton = document.createElement('button');
        confirmButton.className = 'btn btn-primary';
        confirmButton.textContent = t('searchValidateButton');
        confirmButton.addEventListener('click', async () => {
          try {
            const result = (await validateTicket(ticket.ticketId, noteInput.value)) as {
              ok: boolean;
              reason?: string;
            };
            if (result.ok) {
              summary.append(t('searchValidatedSuffix'));
              noteInput.remove();
              confirmButton.remove();
            } else if (result.reason === 'already_validated') {
              summary.append(t('searchAlreadyPickedUpSuffix'));
              noteInput.remove();
              confirmButton.remove();
            } else {
              summary.append(t('searchNotFoundSuffix'));
              noteInput.remove();
              confirmButton.remove();
            }
          } catch {
            summary.append(t('searchErrorSuffix'));
          }
        });
        li.appendChild(noteInput);
        li.appendChild(confirmButton);
      }
      resultsList.appendChild(li);
    }
  }
}
```

- [ ] **Step 2: Manually verify in the dev server**

Run: `npm --prefix web run dev`, navigate to Search (חיפוש).
Expected: field labels and placeholders are in Hebrew; pressing Enter in the search box runs the search (not just clicking the button); each result row shows a colored status pill ("הונפק" blue / "נמסר" green); manually validating an `issued` result appends the translated " — אושר" suffix and removes the note field/button.

- [ ] **Step 3: Commit**

```bash
git add web/src/searchView.ts
git commit -m "feat: translate search view, add Enter-to-search and status pills"
```

---

### Task 9: Dashboard translation & polish (`dashboardView.ts`)

**Files:**
- Modify: `web/src/dashboardView.ts`

**Interfaces:**
- Consumes: `resendTicketEmail` from `./ticketApi`; `formatItemList`, `formatTimestamp` from `./format`; `t` from `./i18n`.
- Produces: `renderDashboardView(container: HTMLElement): Promise<void>` (unchanged signature).

No existing `dashboardView.test.ts` today; verified manually in Step 2.

- [ ] **Step 1: Rewrite `dashboardView.ts`**

```typescript
// web/src/dashboardView.ts
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { db } from './firebaseClient';
import { resendTicketEmail } from './ticketApi';
import { formatItemList, formatTimestamp } from './format';
import { t } from './i18n';

export async function renderDashboardView(container: HTMLElement) {
  container.innerHTML = `
    <div class="search-controls">
      <select id="status-filter">
        <option value="issued">${t('statusIssued')}</option>
        <option value="validated">${t('statusValidated')}</option>
      </select>
    </div>
    <ul id="ticket-list" class="ticket-list"></ul>
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
      const validatedText = data.validatedAt
        ? ` ${t('dashboardValidatedAt', { time: formatTimestamp(data.validatedAt.seconds) })}`
        : '';
      summary.textContent = `${data.customerName} — ${formatItemList(data.items)}${validatedText}`;
      li.appendChild(summary);

      if (data.emailStatus === 'failed') {
        const resendButton = document.createElement('button');
        resendButton.className = 'btn btn-secondary';
        resendButton.textContent = t('dashboardResendButton');
        resendButton.addEventListener('click', async () => {
          resendButton.disabled = true;
          const result = (await resendTicketEmail(ticketId)) as { sent: boolean };
          resendButton.textContent = result.sent ? t('dashboardResendSuccess') : t('dashboardResendFailure');
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

- [ ] **Step 2: Manually verify in the dev server**

Run: `npm --prefix web run dev`, navigate to Dashboard (לוח בקרה).
Expected: filter options read "הונפק"/"נמסר"; validated rows show "(נמסר ב-&lt;timestamp&gt;)" in Hebrew date format; a row with a failed email shows "שליחה חוזרת של האימייל" and updates to "האימייל נשלח מחדש" or "השליחה נכשלה — נסו שוב" after clicking.

- [ ] **Step 3: Commit**

```bash
git add web/src/dashboardView.ts
git commit -m "feat: translate dashboard view"
```

---

### Task 10: Full verification pass

**Files:** none (verification only).

- [ ] **Step 1: Run the full test suite**

Run: `npm --prefix web test`
Expected: all suites pass (`i18n`, `format`, `ticketApi`, `scanFlow`, plus any pre-existing suites untouched by this plan).

- [ ] **Step 2: Run a production build**

Run: `npm --prefix web run build`
Expected: builds cleanly with no TypeScript errors.

- [ ] **Step 3: Manual smoke test checklist**

On a real phone, logged in as a real staff account:
- [ ] App defaults to Hebrew and RTL on first load (no stored `lang`).
- [ ] Language toggle switches the entire app (login, header, nav, current view) between Hebrew and English, and flips `dir` each time.
- [ ] Scan an `issued` ticket's QR → preview card → "Confirm pickup" → success card → ticket now shows as `validated` in Dashboard.
- [ ] Scan that same QR again → "Already picked up" card with time/staff shown, no way to re-confirm.
- [ ] Scan an unrecognized/garbage QR → "Ticket not found" card with a working link into Search.
- [ ] In Search, manually validate a ticket by name/phone/transaction code with a note; confirm it moves to `validated` in Dashboard.
- [ ] Confirm the scan view is comfortably usable one-handed (camera view, preview card, and Confirm button all reachable by thumb without repositioning grip).
- [ ] Resend a failed email from Dashboard and confirm the button updates.

- [ ] **Step 4: Commit** (only if the smoke test surfaces fixes)

If the manual pass finds a bug, fix it, re-run the affected automated tests, and commit the fix with a message describing what was wrong — otherwise no commit is needed for this task.

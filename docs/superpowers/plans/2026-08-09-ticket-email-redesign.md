# Ticket Confirmation Email Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the buyer-facing ticket confirmation email's bare unstyled HTML with a branded, table-based template (logo, color, receipt details, RTL support) driven entirely by the existing `settings/emailTemplate` Firestore doc, so `functions/src` stays free of any hardcoded brand, color, or language.

**Architecture:** `buildTicketEmailHtml()` in `functions/src/email.ts` is rewritten in place — still a plain TypeScript function returning an HTML string, no templating engine added. `EmailSettings` in `functions/src/settings.ts` gains new branding/label fields with generic defaults. The QR-as-CID-attachment mechanism and the `sendViaGmail`/`sendViaResend` dispatch logic are untouched.

**Tech Stack:** TypeScript, Jest (`ts-jest`), Firebase Functions v2, Firestore (emulator for `settings.test.ts`, mocked for `email.test.ts`).

## Global Constraints

- No new npm dependencies — table-based HTML + inline styles, no templating engine, no image-generation library.
- `functions/src` must render a neutral, brand-free email when the `settings/emailTemplate` doc is empty/missing (generic-repo requirement).
- Only `Arial, Helvetica, sans-serif` is used for typography — the one web-safe stack with full Hebrew glyph coverage across Outlook/Gmail/Apple Mail.
- Currency is `currencySymbol + amount.toFixed(2)` — no `Intl`/locale-based formatting (would bake in a locale assumption).
- Date is fixed `DD.MM.YYYY` — no locale-specific month names.
- The punch-hole notch detail must be wrapped in `<!--[if !mso]><!-->…<!--<![endif]-->` so Outlook desktop falls back to a plain rectangular hero band.
- All ticket-sourced and settings-sourced strings interpolated into the HTML go through the existing `escapeHtml()` helper in `email.ts`.
- Spec: [`docs/superpowers/specs/2026-08-09-ticket-email-redesign-design.md`](../specs/2026-08-09-ticket-email-redesign-design.md).

---

## Task 1: Extend `EmailSettings` with branding and label fields

**Files:**
- Modify: `functions/src/settings.ts`
- Test: `functions/src/settings.test.ts`

**Interfaces:**
- Produces: `EmailSettings` interface gains `businessName: string`, `logoUrl: string | null`, `primaryColor: string`, `direction: 'rtl' | 'ltr'`, `currencySymbol: string`, `totalLabel: string`, `dateLabel: string`, `confirmationCodeLabel: string`. `DEFAULT_EMAIL_SETTINGS` provides a generic default for each. Task 2 consumes all of these from the object returned by `getEmailSettings()`.

- [ ] **Step 1: Write failing tests for the new default values**

Add to `functions/src/settings.test.ts`, inside the existing `describe('getEmailSettings', ...)` block:

```ts
  test('returns generic, brand-free defaults for the new branding fields', async () => {
    const settings = await getEmailSettings();
    expect(settings.businessName).toBe('Your Business');
    expect(settings.logoUrl).toBeNull();
    expect(settings.primaryColor).toBe('#3a3a3a');
    expect(settings.direction).toBe('ltr');
    expect(settings.currencySymbol).toBe('$');
    expect(settings.totalLabel).toBe('Total');
    expect(settings.dateLabel).toBe('Date');
    expect(settings.confirmationCodeLabel).toBe('Confirmation code');
  });

  test('overrides branding fields independently from other defaults', async () => {
    await db.collection('settings').doc('emailTemplate').set({
      businessName: 'Acme Bakery',
      primaryColor: '#1f6f5c',
      direction: 'rtl',
    });
    const settings = await getEmailSettings();
    expect(settings.businessName).toBe('Acme Bakery');
    expect(settings.primaryColor).toBe('#1f6f5c');
    expect(settings.direction).toBe('rtl');
    expect(settings.logoUrl).toBeNull();
    expect(settings.currencySymbol).toBe('$');
    expect(settings.subject).toBe('Your pickup ticket');
  });
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `cd functions && npm run test:emulator -- settings.test.ts`
Expected: FAIL — `settings.businessName` etc. are `undefined`, not the expected values (the fields don't exist on `EmailSettings` yet).

- [ ] **Step 3: Extend `EmailSettings` and `DEFAULT_EMAIL_SETTINGS`**

Replace the full contents of `functions/src/settings.ts`:

```ts
import { db } from './admin';

export interface EmailSettings {
  subject: string;
  greeting: string;
  qrInstructions: string;
  itemsLabel: string;
  businessName: string;
  logoUrl: string | null;
  primaryColor: string;
  direction: 'rtl' | 'ltr';
  currencySymbol: string;
  totalLabel: string;
  dateLabel: string;
  confirmationCodeLabel: string;
}

const DEFAULT_EMAIL_SETTINGS: EmailSettings = {
  subject: 'Your pickup ticket',
  greeting: 'Thanks for your purchase!',
  qrInstructions: 'Show this QR code at pickup:',
  itemsLabel: 'Items:',
  businessName: 'Your Business',
  logoUrl: null,
  primaryColor: '#3a3a3a',
  direction: 'ltr',
  currencySymbol: '$',
  totalLabel: 'Total',
  dateLabel: 'Date',
  confirmationCodeLabel: 'Confirmation code',
};

export async function getEmailSettings(): Promise<EmailSettings> {
  const doc = await db.collection('settings').doc('emailTemplate').get();
  if (!doc.exists) return DEFAULT_EMAIL_SETTINGS;
  return { ...DEFAULT_EMAIL_SETTINGS, ...(doc.data() as Partial<EmailSettings>) };
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `cd functions && npm run test:emulator -- settings.test.ts`
Expected: PASS — all tests in `settings.test.ts`, including the two new ones.

- [ ] **Step 5: Commit**

```bash
git add functions/src/settings.ts functions/src/settings.test.ts
git commit -m "feat: add branding and label fields to EmailSettings"
```

---

## Task 2: Rewrite `buildTicketEmailHtml` as a branded, table-based template

**Files:**
- Modify: `functions/src/email.ts:20-33`
- Test: `functions/src/email.test.ts`

**Interfaces:**
- Consumes: `EmailSettings` from Task 1 (`businessName`, `logoUrl`, `primaryColor`, `direction`, `currencySymbol`, `totalLabel`, `dateLabel`, `confirmationCodeLabel`, plus the pre-existing `subject`, `greeting`, `qrInstructions`, `itemsLabel`). `Ticket` fields already in `functions/src/types.ts`: `paymentSum`, `issuedAt` (`FirebaseFirestore.Timestamp`), `transactionCode`.
- Produces: `buildTicketEmailHtml(ticket: Ticket, qrCid: string, settings: EmailSettings): string` — same exported signature as before, only the returned HTML changes. `sendViaGmail`/`sendViaResend` in the same file call this function unchanged and need no modification themselves.

- [ ] **Step 1: Update test fixtures so the file compiles against the extended `EmailSettings`**

In `functions/src/email.test.ts`, replace the `jest.mock('./settings', ...)` block (lines 11-18) with:

```ts
jest.mock('./settings', () => ({
  getEmailSettings: jest.fn().mockResolvedValue({
    subject: 'Your pickup ticket',
    greeting: 'Thanks for your purchase!',
    qrInstructions: 'Show this QR code at pickup:',
    itemsLabel: 'Items:',
    businessName: 'Your Business',
    logoUrl: null,
    primaryColor: '#3a3a3a',
    direction: 'ltr',
    currencySymbol: '$',
    totalLabel: 'Total',
    dateLabel: 'Date',
    confirmationCodeLabel: 'Confirmation code',
  }),
}));
```

And replace the `sampleSettings` constant (lines 37-42) with:

```ts
const sampleSettings: EmailSettings = {
  subject: 'Your pickup ticket',
  greeting: 'Thanks for your purchase!',
  qrInstructions: 'Show this QR code at pickup:',
  itemsLabel: 'Items:',
  businessName: 'Your Business',
  logoUrl: null,
  primaryColor: '#3a3a3a',
  direction: 'ltr',
  currencySymbol: '$',
  totalLabel: 'Total',
  dateLabel: 'Date',
  confirmationCodeLabel: 'Confirmation code',
};
```

- [ ] **Step 2: Run the existing tests and confirm they still pass**

Run: `cd functions && npx jest email.test.ts`
Expected: PASS — this step only added fields to the fixtures, no behavior changed yet, so all pre-existing tests (customer name/settings copy/cid/item list, no `data:` URI, HTML escaping) stay green.

- [ ] **Step 3: Write failing tests for the new branding, receipt, and layout behavior**

Add these new `describe` blocks to `functions/src/email.test.ts`, after the existing `describe('buildTicketEmailHtml', ...)` block:

```ts
describe('buildTicketEmailHtml branding', () => {
  test('renders business name and primary color in the hero band', () => {
    const html = buildTicketEmailHtml(sampleTicket, 'qr-cid-123', {
      ...sampleSettings,
      businessName: 'Acme Bakery',
      primaryColor: '#1f6f5c',
    });
    expect(html).toContain('Acme Bakery');
    expect(html).toContain('background:#1f6f5c');
  });

  test('renders the logo image when logoUrl is set', () => {
    const html = buildTicketEmailHtml(sampleTicket, 'qr-cid-123', {
      ...sampleSettings,
      logoUrl: 'https://example.com/logo.png',
    });
    expect(html).toContain('src="https://example.com/logo.png"');
  });

  test('omits the logo image entirely when logoUrl is null', () => {
    const html = buildTicketEmailHtml(sampleTicket, 'qr-cid-123', { ...sampleSettings, logoUrl: null });
    expect(html).not.toContain('width="48"');
  });

  test('wraps the punch-hole notch markup in MSO conditional comments so Outlook falls back to a plain band', () => {
    const html = buildTicketEmailHtml(sampleTicket, 'qr-cid-123', sampleSettings);
    expect(html).toContain('<!--[if !mso]><!-->');
    expect(html).toContain('<!--<![endif]-->');
  });
});

describe('buildTicketEmailHtml receipt details', () => {
  test('renders total (currencySymbol + amount) and confirmation code from ticket data', () => {
    const html = buildTicketEmailHtml(
      { ...sampleTicket, paymentSum: 145, transactionCode: 'TXN-8841' },
      'qr-cid-123',
      sampleSettings,
    );
    expect(html).toContain('Total: $145.00');
    expect(html).toContain('Confirmation code: TXN-8841');
  });

  test('formats issuedAt as DD.MM.YYYY', () => {
    const html = buildTicketEmailHtml(
      { ...sampleTicket, issuedAt: Timestamp.fromDate(new Date(2026, 7, 9)) },
      'qr-cid-123',
      sampleSettings,
    );
    expect(html).toContain('Date: 09.08.2026');
  });

  test('escapes the transaction code', () => {
    const html = buildTicketEmailHtml(
      { ...sampleTicket, transactionCode: '<script>alert(1)</script>' },
      'qr-cid-123',
      sampleSettings,
    );
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });
});

describe('buildTicketEmailHtml direction', () => {
  test('sets dir="rtl" and right-aligns text when direction is rtl', () => {
    const html = buildTicketEmailHtml(sampleTicket, 'qr-cid-123', { ...sampleSettings, direction: 'rtl' });
    expect(html).toContain('dir="rtl"');
    expect(html).toContain('text-align:right');
  });

  test('sets dir="ltr" and left-aligns text when direction is ltr', () => {
    const html = buildTicketEmailHtml(sampleTicket, 'qr-cid-123', { ...sampleSettings, direction: 'ltr' });
    expect(html).toContain('dir="ltr"');
    expect(html).toContain('text-align:left');
  });
});
```

- [ ] **Step 4: Run the tests and confirm the new ones fail**

Run: `cd functions && npx jest email.test.ts`
Expected: FAIL on every test in the three new `describe` blocks — `buildTicketEmailHtml` doesn't render a hero band, logo, notches, total, date, or confirmation code yet, and doesn't set `dir` or `text-align` from `settings.direction`.

- [ ] **Step 5: Rewrite `buildTicketEmailHtml`**

In `functions/src/email.ts`, add a `formatDate` helper directly above `buildTicketEmailHtml`, and replace the existing `buildTicketEmailHtml` function (current lines 20-33) with:

```ts
function formatDate(timestamp: FirebaseFirestore.Timestamp): string {
  const date = timestamp.toDate();
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}.${month}.${date.getFullYear()}`;
}

export function buildTicketEmailHtml(ticket: Ticket, qrCid: string, settings: EmailSettings): string {
  const align = settings.direction === 'rtl' ? 'right' : 'left';

  const itemsHtml = ticket.items
    .map(
      (item) =>
        `<tr><td style="padding:4px 0;text-align:${align};font-size:14px;color:#333333;">${item.quantity} x ${escapeHtml(item.name)}</td></tr>`,
    )
    .join('');

  const logoHtml = settings.logoUrl
    ? `<img src="${escapeHtml(settings.logoUrl)}" alt="${escapeHtml(settings.businessName)}" width="48" height="48" style="display:block;margin:0 auto 8px auto;border-radius:8px;" />`
    : '';

  // Two small circles, filled with the body's white background, sitting at the
  // hero band's bottom corners to read as a ticket's punch holes. Outlook
  // desktop's rendering engine (Word) handles absolute positioning and
  // border-radius poorly, so it's excluded via MSO conditional comments —
  // Outlook simply sees the plain rectangular band underneath instead.
  const notchesHtml = `<!--[if !mso]><!-->
        <div style="position:absolute;bottom:-10px;left:-10px;width:20px;height:20px;border-radius:50%;background:#ffffff;"></div>
        <div style="position:absolute;bottom:-10px;right:-10px;width:20px;height:20px;border-radius:50%;background:#ffffff;"></div>
        <!--<![endif]-->`;

  return `
    <div dir="${settings.direction}" style="font-family:Arial,Helvetica,sans-serif;background:#ffffff;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;">
        <tr>
          <td style="position:relative;background:${escapeHtml(settings.primaryColor)};padding:24px 16px 34px;text-align:center;color:#ffffff;">
            ${logoHtml}
            <div style="font-size:16px;font-weight:bold;">${escapeHtml(settings.businessName)}</div>
            <p style="margin:8px 0 0;font-size:14px;">Hi ${escapeHtml(ticket.customerName)}, ${escapeHtml(settings.greeting)}</p>
            ${notchesHtml}
          </td>
        </tr>
        <tr>
          <td style="text-align:center;padding:24px 16px 8px;">
            <img src="cid:${qrCid}" alt="Pickup QR code" width="300" height="300" />
            <p style="font-size:13px;color:#555555;margin:8px 0 0;">${escapeHtml(settings.qrInstructions)}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 24px 24px;">
            <p style="font-size:13px;color:#333333;text-align:${align};margin:0 0 8px;">${escapeHtml(settings.itemsLabel)}</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              ${itemsHtml}
              <tr>
                <td style="padding:8px 0 0;border-top:1px solid #eeeeee;font-weight:bold;text-align:${align};font-size:14px;color:#333333;">
                  ${escapeHtml(settings.totalLabel)}: ${escapeHtml(settings.currencySymbol)}${ticket.paymentSum.toFixed(2)}
                </td>
              </tr>
            </table>
            <p style="font-size:11px;color:#999999;margin:12px 0 0;text-align:${align};">
              ${escapeHtml(settings.confirmationCodeLabel)}: ${escapeHtml(ticket.transactionCode)} &middot; ${escapeHtml(settings.dateLabel)}: ${formatDate(ticket.issuedAt)}
            </p>
          </td>
        </tr>
      </table>
    </div>
  `;
}
```

- [ ] **Step 6: Run the tests and confirm they all pass**

Run: `cd functions && npx jest email.test.ts`
Expected: PASS — every test in `email.test.ts`, including all three pre-existing describe blocks and the three new ones from Step 3.

- [ ] **Step 7: Run the full functions test suite**

Run: `cd functions && npx jest`
Expected: PASS — `callables.test.ts` and `webhookHandler.test.ts` call through to `sendTicketEmail`/`buildTicketEmailHtml` indirectly; confirm the rewrite didn't break either (they assert on `emailStatus`/call counts, not literal HTML content, so no changes are expected there — this step just confirms that assumption).

- [ ] **Step 8: Commit**

```bash
git add functions/src/email.ts functions/src/email.test.ts
git commit -m "feat: redesign ticket email as a branded, table-based template"
```

---

## Post-Plan Note (not a task — informational)

This plan does not update `habaronit-qr`'s live `settings/emailTemplate` Firestore document with real Hebrew branding values (business name, logo URL, primary color, `direction: 'rtl'`, Hebrew labels). That's a data change, not a code change, and per [[grow-ticketing-no-adc]] requires a temporary deployed Cloud Function (no ADC available in this environment) — do it as a follow-up after this plan merges and deploys, the same way the `seedTestTickets` one-off function was used previously.

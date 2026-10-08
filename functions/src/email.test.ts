import { Timestamp } from 'firebase-admin/firestore';
import { buildTicketEmailHtml, sendTicketEmail, QR_IMAGE_CID } from './email';
import { Ticket } from './types';
import { EmailSettings, getEmailSettings } from './settings';

const sendMailMock = jest.fn();
jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({ sendMail: sendMailMock })),
}));

jest.mock('./settings', () => ({
  getEmailSettings: jest.fn().mockResolvedValue({
    subject: 'Your pickup ticket',
    preheader: 'Your ticket QR code is inside. Show it at pickup.',
    greeting: 'Hi {customerName}, thanks for your purchase!',
    qrInstructions: 'Show this QR code at pickup',
    itemsLabel: 'Items',
    businessName: 'Your Business',
    logoUrl: null,
    primaryColor: '#3a3a3a',
    direction: 'ltr',
    currencySymbol: '$',
    totalLabel: 'Total',
    dateLabel: 'Date',
    confirmationCodeLabel: 'Confirmation code',
    qrAltText: 'Pickup QR code',
    itemSeparator: 'x',
    utcOffsetMinutes: 0,
    sendingEnabled: true,
    redirectAllEmails: false,
    redirectAllEmailsTo: '',
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
  issuedAt: Timestamp.now(),
  validatedAt: null,
  validatedBy: null,
  validatedByEmail: null,
  validationNote: null,
  emailStatus: 'failed',
};

const sampleSettings: EmailSettings = {
  subject: 'Your pickup ticket',
  preheader: 'Your ticket QR code is inside. Show it at pickup.',
  greeting: 'Hi {customerName}, thanks for your purchase!',
  qrInstructions: 'Show this QR code at pickup',
  itemsLabel: 'Items',
  businessName: 'Your Business',
  logoUrl: null,
  primaryColor: '#3a3a3a',
  direction: 'ltr',
  currencySymbol: '$',
  totalLabel: 'Total',
  dateLabel: 'Date',
  confirmationCodeLabel: 'Confirmation code',
  qrAltText: 'Pickup QR code',
  itemSeparator: 'x',
  utcOffsetMinutes: 0,
  sendingEnabled: true,
  redirectAllEmails: false,
  redirectAllEmailsTo: '',
};

describe('buildTicketEmailHtml', () => {
  test('includes customer name, settings copy, QR image cid reference, and item list', () => {
    const html = buildTicketEmailHtml(sampleTicket, 'qr-cid-123', sampleSettings);
    expect(html).toContain('Jane Doe');
    expect(html).toContain('thanks for your purchase!');
    expect(html).toContain('src="cid:qr-cid-123"');
    expect(html).toContain('2 x Widget');
  });

  test('does not embed the QR as a data: URI (Gmail does not render those)', () => {
    const html = buildTicketEmailHtml(sampleTicket, 'qr-cid-123', sampleSettings);
    expect(html).not.toContain('data:image');
  });

  test('escapes HTML in customer name and item names', () => {
    const html = buildTicketEmailHtml(
      {
        ...sampleTicket,
        customerName: '<script>alert(1)</script>',
        items: [{ name: 'Widget <b>&</b>', quantity: 1 }],
      },
      'qr-cid-123',
      sampleSettings,
    );
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('Widget &lt;b&gt;&amp;&lt;/b&gt;');
  });
});

describe('buildTicketEmailHtml mobile QR legibility', () => {
  test('displays the QR at half its 592px source size so it stays sharp on 2x screens', () => {
    const html = buildTicketEmailHtml(sampleTicket, 'qr-cid-123', sampleSettings);
    expect(html).toMatch(/<img src="cid:qr-cid-123"[^>]*width="296" height="296"/);
  });

  test('shows the confirmation code prominently between the QR and the item list', () => {
    const html = buildTicketEmailHtml(sampleTicket, 'qr-cid-123', sampleSettings);
    const qrIndex = html.indexOf('src="cid:qr-cid-123"');
    const codeIndex = html.indexOf('Confirmation code: TX-1');
    const itemsIndex = html.indexOf('Items:');
    expect(qrIndex).toBeGreaterThan(-1);
    expect(codeIndex).toBeGreaterThan(qrIndex);
    expect(codeIndex).toBeLessThan(itemsIndex);
    expect(html.slice(html.lastIndexOf('<p', codeIndex), codeIndex)).toContain('font-size:16px');
  });

  test('renders the confirmation code only once', () => {
    const html = buildTicketEmailHtml(sampleTicket, 'qr-cid-123', sampleSettings);
    expect(html.split('TX-1').length - 1).toBe(1);
  });

  test('does not use low-contrast #999999 text or sub-13px font sizes', () => {
    const html = buildTicketEmailHtml(sampleTicket, 'qr-cid-123', sampleSettings);
    // The hidden preheader deliberately uses font-size:1px; only visible text counts.
    const visibleHtml = html.slice(html.indexOf('<div dir='));
    expect(visibleHtml).not.toContain('#999999');
    expect(visibleHtml).not.toMatch(/font-size:(?:[0-9]|1[0-2])px/);
  });

  test('includes a viewport meta tag', () => {
    const html = buildTicketEmailHtml(sampleTicket, 'qr-cid-123', sampleSettings);
    expect(html).toContain('<meta name="viewport" content="width=device-width, initial-scale=1"');
  });
});

describe('buildTicketEmailHtml preheader', () => {
  test('renders the preheader as hidden text before the visible content', () => {
    const html = buildTicketEmailHtml(sampleTicket, 'qr-cid-123', sampleSettings);
    const preheaderIndex = html.indexOf('Your ticket QR code is inside.');
    expect(preheaderIndex).toBeGreaterThan(-1);
    expect(preheaderIndex).toBeLessThan(html.indexOf('Your Business'));
    expect(html.slice(html.lastIndexOf('<div', preheaderIndex), preheaderIndex)).toContain('display:none');
  });

  test('escapes the preheader', () => {
    const html = buildTicketEmailHtml(sampleTicket, 'qr-cid-123', {
      ...sampleSettings,
      preheader: '<b>hi</b>',
    });
    expect(html).not.toContain('<b>hi</b>');
    expect(html).toContain('&lt;b&gt;hi&lt;/b&gt;');
  });
});

describe('buildTicketEmailHtml hero text contrast', () => {
  test('uses white hero text on a dark primary color', () => {
    const html = buildTicketEmailHtml(sampleTicket, 'qr-cid-123', { ...sampleSettings, primaryColor: '#1f3a5c' });
    expect(html).toContain('background:#1f3a5c;padding:24px 16px 34px;text-align:center;color:#ffffff;');
  });

  test('switches to dark hero text on a light primary color', () => {
    const html = buildTicketEmailHtml(sampleTicket, 'qr-cid-123', { ...sampleSettings, primaryColor: '#f5d76e' });
    expect(html).toContain('background:#f5d76e;padding:24px 16px 34px;text-align:center;color:#1a1a1a;');
  });

  test('handles 3-digit hex shorthand', () => {
    const html = buildTicketEmailHtml(sampleTicket, 'qr-cid-123', { ...sampleSettings, primaryColor: '#ff0' });
    expect(html).toContain('color:#1a1a1a;');
  });
});

describe('buildTicketEmailHtml dark mode', () => {
  test('hides the white punch-hole notches in dark mode', () => {
    const html = buildTicketEmailHtml(sampleTicket, 'qr-cid-123', sampleSettings);
    expect(html).toContain('class="ticket-notches"');
    expect(html).toMatch(/@media \(prefers-color-scheme: dark\)\s*\{\s*\.ticket-notches\s*\{\s*display:none !important;/);
    expect(html).toContain('[data-ogsc] .ticket-notches');
  });
});

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
    const imgCount = (html.match(/<img/g) || []).length;
    expect(imgCount).toBe(1);
    expect(html).toContain('src="cid:qr-cid-123"');
  });

  test('wraps the punch-hole notch markup in MSO conditional comments so Outlook falls back to a plain band', () => {
    const html = buildTicketEmailHtml(sampleTicket, 'qr-cid-123', sampleSettings);
    expect(html).toContain('<!--[if !mso]><!-->');
    expect(html).toContain('<!--<![endif]-->');
  });

  test('wraps the punch-hole notch circles in a zero-height overflow-hidden container as a Gmail fallback', () => {
    const html = buildTicketEmailHtml(sampleTicket, 'qr-cid-123', sampleSettings);
    expect(html).toContain('height:0;overflow:hidden');
  });

  test('escapes businessName and label fields', () => {
    const html = buildTicketEmailHtml(sampleTicket, 'qr-cid-123', {
      ...sampleSettings,
      businessName: '<b>Acme</b>',
      totalLabel: '<i>Total</i>',
    });
    expect(html).not.toContain('<b>Acme</b>');
    expect(html).toContain('&lt;b&gt;Acme&lt;/b&gt;');
    expect(html).not.toContain('<i>Total</i>');
    expect(html).toContain('&lt;i&gt;Total&lt;/i&gt;');
  });

  test('falls back to the default color when primaryColor is not a valid hex value', () => {
    const html = buildTicketEmailHtml(sampleTicket, 'qr-cid-123', {
      ...sampleSettings,
      primaryColor: 'red;background-image:url(javascript:alert(1))',
    });
    expect(html).toContain('background:#3a3a3a');
    expect(html).not.toContain('background-image');
  });

  test('uses qrAltText for the QR image alt attribute', () => {
    const html = buildTicketEmailHtml(sampleTicket, 'qr-cid-123', { ...sampleSettings, qrAltText: 'Scan to redeem' });
    expect(html).toContain('alt="Scan to redeem"');
  });

  test('uses a custom itemSeparator', () => {
    const html = buildTicketEmailHtml(sampleTicket, 'qr-cid-123', { ...sampleSettings, itemSeparator: '×' });
    expect(html).toContain('2 × Widget');
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
      { ...sampleTicket, issuedAt: Timestamp.fromDate(new Date(Date.UTC(2026, 7, 9, 12, 0, 0))) },
      'qr-cid-123',
      sampleSettings,
    );
    expect(html).toContain('Date: 09.08.2026');
  });

  test('shifts the date by utcOffsetMinutes before formatting', () => {
    const html = buildTicketEmailHtml(
      { ...sampleTicket, issuedAt: Timestamp.fromDate(new Date('2026-08-08T23:00:00Z')) },
      'qr-cid-123',
      { ...sampleSettings, utcOffsetMinutes: 180 },
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

  test('escapes a malformed direction value instead of breaking out of the attribute', () => {
    const html = buildTicketEmailHtml(sampleTicket, 'qr-cid-123', {
      ...sampleSettings,
      direction: '"><script>alert(1)</script>' as EmailSettings['direction'],
    });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  test('normalizes direction case for alignment even when the value has different casing', () => {
    const html = buildTicketEmailHtml(sampleTicket, 'qr-cid-123', {
      ...sampleSettings,
      direction: 'RTL' as EmailSettings['direction'],
    });
    expect(html).toContain('text-align:right');
  });
});

describe('sendTicketEmail (resend)', () => {
  const originalFetch = global.fetch;
  const originalProvider = process.env.EMAIL_PROVIDER;
  const originalKey = process.env.RESEND_API_KEY;
  const originalFrom = process.env.TICKET_EMAIL_FROM;

  beforeEach(() => {
    process.env.EMAIL_PROVIDER = 'resend';
    process.env.RESEND_API_KEY = 'test-key';
    process.env.TICKET_EMAIL_FROM = 'tickets@verified-domain.example';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.EMAIL_PROVIDER = originalProvider;
    process.env.RESEND_API_KEY = originalKey;
    process.env.TICKET_EMAIL_FROM = originalFrom;
  });

  test('returns true when Resend responds ok', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true } as Response);
    const result = await sendTicketEmail(sampleTicket, 'data:image/png;base64,ABC');
    expect(result).toBe(true);
  });

  test('sends the QR as an inline content_id attachment instead of a data: URI in the html', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true } as Response);
    await sendTicketEmail(sampleTicket, 'data:image/png;base64,QUJD');
    const [, requestInit] = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse(requestInit.body);
    expect(body.html).not.toContain('data:image');
    expect(body.html).toContain(`src="cid:${QR_IMAGE_CID}"`);
    expect(body.attachments).toEqual([
      expect.objectContaining({ content_id: QR_IMAGE_CID, content: 'QUJD' }),
    ]);
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

  test('throws when TICKET_EMAIL_FROM is not configured', async () => {
    delete process.env.TICKET_EMAIL_FROM;
    await expect(sendTicketEmail(sampleTicket, 'data:image/png;base64,ABC')).rejects.toThrow('TICKET_EMAIL_FROM');
  });

  test('throws when TICKET_EMAIL_FROM is set to an empty string', async () => {
    process.env.TICKET_EMAIL_FROM = '';
    await expect(sendTicketEmail(sampleTicket, 'data:image/png;base64,ABC')).rejects.toThrow('TICKET_EMAIL_FROM');
  });
});

describe('sendTicketEmail (gmail)', () => {
  const originalProvider = process.env.EMAIL_PROVIDER;
  const originalUser = process.env.GMAIL_USER;
  const originalPassword = process.env.GMAIL_APP_PASSWORD;

  beforeEach(() => {
    process.env.EMAIL_PROVIDER = 'gmail';
    process.env.GMAIL_USER = 'tickets@gmail.com';
    process.env.GMAIL_APP_PASSWORD = 'test-app-password';
    sendMailMock.mockReset();
  });

  afterEach(() => {
    process.env.EMAIL_PROVIDER = originalProvider;
    process.env.GMAIL_USER = originalUser;
    process.env.GMAIL_APP_PASSWORD = originalPassword;
  });

  test('returns true when nodemailer sends successfully', async () => {
    sendMailMock.mockResolvedValue(undefined);
    const result = await sendTicketEmail(sampleTicket, 'data:image/png;base64,ABC');
    expect(result).toBe(true);
    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({ from: 'tickets@gmail.com', to: 'jane@example.com' }),
    );
  });

  test('attaches the QR as an inline cid attachment instead of a data: URI in the html', async () => {
    sendMailMock.mockResolvedValue(undefined);
    await sendTicketEmail(sampleTicket, 'data:image/png;base64,QUJD');
    const call = sendMailMock.mock.calls[0][0];
    expect(call.html).not.toContain('data:image');
    expect(call.html).toContain(`src="cid:${QR_IMAGE_CID}"`);
    expect(call.attachments).toEqual([
      expect.objectContaining({ cid: QR_IMAGE_CID, content: Buffer.from('QUJD', 'base64') }),
    ]);
  });

  test('returns false when nodemailer throws', async () => {
    sendMailMock.mockRejectedValue(new Error('smtp error'));
    const result = await sendTicketEmail(sampleTicket, 'data:image/png;base64,ABC');
    expect(result).toBe(false);
  });

  test('throws when GMAIL_USER is not configured', async () => {
    delete process.env.GMAIL_USER;
    await expect(sendTicketEmail(sampleTicket, 'data:image/png;base64,ABC')).rejects.toThrow('GMAIL_USER');
  });

  test('throws when GMAIL_APP_PASSWORD is not configured', async () => {
    delete process.env.GMAIL_APP_PASSWORD;
    await expect(sendTicketEmail(sampleTicket, 'data:image/png;base64,ABC')).rejects.toThrow('GMAIL_APP_PASSWORD');
  });
});

describe('sendTicketEmail (sending disabled via settings)', () => {
  test('skips the provider call and returns false without sending', async () => {
    (getEmailSettings as jest.Mock).mockResolvedValueOnce({ ...sampleSettings, sendingEnabled: false });
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    sendMailMock.mockReset();

    const result = await sendTicketEmail(sampleTicket, 'data:image/png;base64,ABC');

    expect(result).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(sendMailMock).not.toHaveBeenCalled();
  });
});

describe('sendTicketEmail (redirectAllEmails)', () => {
  const originalProvider = process.env.EMAIL_PROVIDER;
  const originalUser = process.env.GMAIL_USER;
  const originalPassword = process.env.GMAIL_APP_PASSWORD;

  beforeEach(() => {
    process.env.EMAIL_PROVIDER = 'gmail';
    process.env.GMAIL_USER = 'tickets@gmail.com';
    process.env.GMAIL_APP_PASSWORD = 'test-app-password';
    sendMailMock.mockReset();
  });

  afterEach(() => {
    process.env.EMAIL_PROVIDER = originalProvider;
    process.env.GMAIL_USER = originalUser;
    process.env.GMAIL_APP_PASSWORD = originalPassword;
  });

  test('sends to the configured redirect address instead of the buyer, leaving the rest of the email unchanged', async () => {
    (getEmailSettings as jest.Mock).mockResolvedValueOnce({
      ...sampleSettings,
      redirectAllEmails: true,
      redirectAllEmailsTo: 'test-inbox@example.com',
    });
    sendMailMock.mockResolvedValue(undefined);

    const result = await sendTicketEmail(sampleTicket, 'data:image/png;base64,ABC');

    expect(result).toBe(true);
    const call = sendMailMock.mock.calls[0][0];
    expect(call.to).toBe('test-inbox@example.com');
    expect(call.html).toContain('Jane Doe');
  });

  test('skips sending when redirectAllEmails is enabled but redirectAllEmailsTo is not configured', async () => {
    (getEmailSettings as jest.Mock).mockResolvedValueOnce({
      ...sampleSettings,
      redirectAllEmails: true,
      redirectAllEmailsTo: '',
    });

    const result = await sendTicketEmail(sampleTicket, 'data:image/png;base64,ABC');

    expect(result).toBe(false);
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  test('does not redirect when redirectAllEmails is false', async () => {
    (getEmailSettings as jest.Mock).mockResolvedValueOnce({
      ...sampleSettings,
      redirectAllEmails: false,
      redirectAllEmailsTo: 'test-inbox@example.com',
    });
    sendMailMock.mockResolvedValue(undefined);

    await sendTicketEmail(sampleTicket, 'data:image/png;base64,ABC');

    const call = sendMailMock.mock.calls[0][0];
    expect(call.to).toBe('jane@example.com');
  });
});

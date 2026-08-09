import { Timestamp } from 'firebase-admin/firestore';
import { buildTicketEmailHtml, sendTicketEmail, QR_IMAGE_CID } from './email';
import { Ticket } from './types';
import { EmailSettings } from './settings';

const sendMailMock = jest.fn();
jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({ sendMail: sendMailMock })),
}));

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

describe('buildTicketEmailHtml', () => {
  test('includes customer name, settings copy, QR image cid reference, and item list', () => {
    const html = buildTicketEmailHtml(sampleTicket, 'qr-cid-123', sampleSettings);
    expect(html).toContain('Jane Doe');
    expect(html).toContain('Thanks for your purchase!');
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

  test('escapes a malformed direction value instead of breaking out of the attribute', () => {
    const html = buildTicketEmailHtml(sampleTicket, 'qr-cid-123', {
      ...sampleSettings,
      direction: '"><script>alert(1)</script>' as EmailSettings['direction'],
    });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
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

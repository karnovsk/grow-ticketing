import * as admin from 'firebase-admin';
import { buildTicketEmailHtml, sendTicketEmail } from './email';
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

  test('escapes HTML in customer name and item names', () => {
    const html = buildTicketEmailHtml(
      {
        ...sampleTicket,
        customerName: '<script>alert(1)</script>',
        items: [{ name: 'Widget <b>&</b>', quantity: 1 }],
      },
      'data:image/png;base64,ABC',
      sampleSettings,
    );
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('Widget &lt;b&gt;&amp;&lt;/b&gt;');
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

import { logger } from 'firebase-functions/v2';
import { handleGrowWebhook } from './webhookHandler';
import { clearFirestoreEmulator } from './testHelpers';
import { db } from './admin';

jest.mock('./qr', () => ({
  generateQrDataUri: jest.fn().mockResolvedValue('data:image/png;base64,ABC'),
}));
jest.mock('./email', () => ({
  sendTicketEmail: jest.fn().mockResolvedValue(true),
}));

const PROJECT_ID = process.env.GCLOUD_PROJECT || 'demo-grow-ticketing';

// Shape of a real Grow "Payment Links" webhook call (see webhookLogs in
// production) — paymentSum is a numeric string, there's no items array,
// and the buyer's name field is `fullName`, not `payerFullName`.
const validPayload = {
  webhookKey: 'secret-1',
  transactionCode: 'TX-100',
  paymentSum: '42',
  fullName: 'Jane Doe',
  payerEmail: 'jane@example.com',
  payerPhone: '0501234567',
  paymentDesc: 'Widget',
  paymentSource: 'Payment Links',
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

  test('rejects a payload missing paymentDesc', async () => {
    const { paymentDesc, ...rest } = validPayload;
    const result = await handleGrowWebhook(rest);
    expect(result.status).toBe(400);
  });

  test('rejects a payload with a non-numeric paymentSum', async () => {
    const result = await handleGrowWebhook({ ...validPayload, paymentSum: 'not-a-number' });
    expect(result.status).toBe(400);
  });

  test('maps a real Grow Payment Links payload onto the created ticket', async () => {
    const result = await handleGrowWebhook(validPayload);
    expect(result.status).toBe(200);

    const ticketDoc = await db.collection('tickets').doc(result.body.ticketId as string).get();
    const ticket = ticketDoc.data();
    expect(ticket?.customerName).toBe('Jane Doe');
    expect(ticket?.customerEmail).toBe('jane@example.com');
    expect(ticket?.paymentSum).toBe(42);
    expect(ticket?.items).toEqual([{ name: 'Widget', quantity: 1 }]);
  });

  test('logs the incoming payload with the webhookKey redacted, for both valid and invalid requests', async () => {
    const infoSpy = jest.spyOn(logger, 'info').mockImplementation(() => {});

    await handleGrowWebhook(validPayload);
    expect(infoSpy).toHaveBeenCalledWith(
      'Received Grow webhook payload',
      { body: expect.objectContaining({ ...validPayload, webhookKey: '[redacted]' }) },
    );

    await handleGrowWebhook({ ...validPayload, webhookKey: 'wrong' });
    expect(infoSpy).toHaveBeenCalledWith(
      'Received Grow webhook payload',
      { body: expect.objectContaining({ webhookKey: '[redacted]' }) },
    );

    infoSpy.mockRestore();
  });

  test('persists the payload to webhookLogs with the webhookKey redacted, for a valid request', async () => {
    await handleGrowWebhook(validPayload);

    const snapshot = await db.collection('webhookLogs').get();
    expect(snapshot.size).toBe(1);
    const logged = snapshot.docs[0].data();
    expect(logged.receivedAt).toBeDefined();
    expect(logged.body).toEqual(expect.objectContaining({ ...validPayload, webhookKey: '[redacted]' }));
  });

  test('persists the payload to webhookLogs even when it is malformed and gets rejected', async () => {
    await handleGrowWebhook({ webhookKey: 'secret-1', unexpected: 'shape' });

    const snapshot = await db.collection('webhookLogs').get();
    expect(snapshot.size).toBe(1);
    const logged = snapshot.docs[0].data();
    expect(logged.body).toEqual({ webhookKey: '[redacted]', unexpected: 'shape' });
  });

  test('persists the payload to webhookLogs even when the webhook key is wrong', async () => {
    await handleGrowWebhook({ ...validPayload, webhookKey: 'wrong' });

    const snapshot = await db.collection('webhookLogs').get();
    expect(snapshot.size).toBe(1);
  });
});

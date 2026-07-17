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

  test('rejects a payload with no items', async () => {
    const result = await handleGrowWebhook({ ...validPayload, productData: [] });
    expect(result.status).toBe(400);
  });
});

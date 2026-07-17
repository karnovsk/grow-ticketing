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

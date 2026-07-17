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

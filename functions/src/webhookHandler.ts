import { Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { db } from './admin';
import { GrowWebhookPayload } from './types';
import { verifyWebhookKey } from './webhookAuth';
import { createTicketIfNew, updateEmailStatus } from './ticketService';
import { generateQrDataUri } from './qr';
import { sendTicketEmail } from './email';

export interface WebhookResult {
  status: number;
  body: Record<string, unknown>;
}

const WEBHOOK_LOGS_COLLECTION = 'webhookLogs';

function redactForLogging(body: unknown): unknown {
  if (typeof body !== 'object' || body === null) return body;
  const record = { ...(body as Record<string, unknown>) };
  if ('webhookKey' in record) record.webhookKey = '[redacted]';
  return record;
}

// Persists every incoming call before any parsing/validation/auth check, so a
// payload that doesn't match our expected shape (or a real Grow format we
// haven't implemented yet) is still reviewable — not just app-code-reachable
// Cloud Logging, which never gets written to if the instance crashes before
// running our code (e.g. the secret-fetch startup failure this caught once
// already). A failure writing this log must never block the actual webhook
// response, so it's swallowed and reported as a warning instead of thrown.
async function logIncomingWebhook(redactedBody: unknown): Promise<void> {
  try {
    await db.collection(WEBHOOK_LOGS_COLLECTION).add({ receivedAt: Timestamp.now(), body: redactedBody });
  } catch (error) {
    logger.warn('Failed to persist incoming Grow webhook payload to webhookLogs', { error: String(error) });
  }
}

// Grow's real "Payment Links" webhook call (confirmed against the webhookLogs
// collection) sends paymentSum as a numeric string and has no items array —
// it's a single fixed-price link, described by paymentDesc instead of a cart.
function parsePayload(body: unknown): GrowWebhookPayload | null {
  if (typeof body !== 'object' || body === null) return null;
  const record = body as Record<string, unknown>;
  if (typeof record.webhookKey !== 'string') return null;
  if (typeof record.transactionCode !== 'string') return null;
  if (typeof record.payerEmail !== 'string') return null;
  if (typeof record.paymentDesc !== 'string' || record.paymentDesc.length === 0) return null;

  const paymentSum = typeof record.paymentSum === 'string' ? Number(record.paymentSum) : record.paymentSum;
  if (typeof paymentSum !== 'number' || !Number.isFinite(paymentSum)) return null;

  return {
    webhookKey: record.webhookKey,
    transactionCode: record.transactionCode,
    paymentSum,
    payerFullName: typeof record.fullName === 'string' ? record.fullName : undefined,
    payerEmail: record.payerEmail,
    payerPhone: typeof record.payerPhone === 'string' ? record.payerPhone : undefined,
    productData: [{ name: record.paymentDesc, quantity: 1 }],
  };
}

export async function handleGrowWebhook(rawBody: unknown): Promise<WebhookResult> {
  const redactedBody = redactForLogging(rawBody);
  logger.info('Received Grow webhook payload', { body: redactedBody });
  await logIncomingWebhook(redactedBody);

  const payload = parsePayload(rawBody);
  if (!payload) {
    logger.warn('Rejected Grow webhook: missing or malformed required fields', { body: redactForLogging(rawBody) });
    return { status: 400, body: { error: 'invalid_payload' } };
  }
  if (!verifyWebhookKey(payload)) {
    logger.warn('Rejected Grow webhook: invalid webhookKey', { transactionCode: payload.transactionCode });
    return { status: 401, body: { error: 'invalid_webhook_key' } };
  }

  const { ticket, created } = await createTicketIfNew({
    transactionCode: payload.transactionCode,
    customerName: payload.payerFullName || 'Customer',
    customerEmail: payload.payerEmail || '',
    customerPhone: payload.payerPhone || null,
    items: payload.productData || [],
    paymentSum: payload.paymentSum,
  });

  if (!created) {
    return { status: 200, body: { ticketId: ticket.ticketId, created: false } };
  }

  const qrDataUri = await generateQrDataUri(ticket.ticketId);
  const sent = await sendTicketEmail(ticket, qrDataUri);
  await updateEmailStatus(ticket.ticketId, sent ? 'sent' : 'failed');

  return { status: 200, body: { ticketId: ticket.ticketId, created: true } };
}

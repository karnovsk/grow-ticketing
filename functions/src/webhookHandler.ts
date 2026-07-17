import { logger } from 'firebase-functions/v2';
import { GrowWebhookPayload, TicketItem } from './types';
import { verifyWebhookKey } from './webhookAuth';
import { createTicketIfNew, updateEmailStatus } from './ticketService';
import { generateQrDataUri } from './qr';
import { sendTicketEmail } from './email';

export interface WebhookResult {
  status: number;
  body: Record<string, unknown>;
}

function redactForLogging(body: unknown): unknown {
  if (typeof body !== 'object' || body === null) return body;
  const record = { ...(body as Record<string, unknown>) };
  if ('webhookKey' in record) record.webhookKey = '[redacted]';
  return record;
}

function parsePayload(body: unknown): GrowWebhookPayload | null {
  if (typeof body !== 'object' || body === null) return null;
  const record = body as Record<string, unknown>;
  if (typeof record.webhookKey !== 'string') return null;
  if (typeof record.transactionCode !== 'string') return null;
  if (typeof record.paymentSum !== 'number') return null;
  if (typeof record.payerEmail !== 'string') return null;
  if (!Array.isArray(record.productData) || record.productData.length === 0) return null;
  return {
    webhookKey: record.webhookKey,
    transactionCode: record.transactionCode,
    paymentSum: record.paymentSum,
    payerFullName: typeof record.payerFullName === 'string' ? record.payerFullName : undefined,
    payerEmail: record.payerEmail,
    payerPhone: typeof record.payerPhone === 'string' ? record.payerPhone : undefined,
    productData: record.productData as TicketItem[],
  };
}

export async function handleGrowWebhook(rawBody: unknown): Promise<WebhookResult> {
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

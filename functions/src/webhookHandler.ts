import { GrowWebhookPayload, TicketItem } from './types';
import { verifyWebhookKey } from './webhookAuth';
import { createTicket, findTicketByTransactionCode, updateEmailStatus } from './ticketService';
import { generateQrDataUri } from './qr';
import { sendTicketEmail } from './email';

export interface WebhookResult {
  status: number;
  body: Record<string, unknown>;
}

function parsePayload(body: unknown): GrowWebhookPayload | null {
  if (typeof body !== 'object' || body === null) return null;
  const record = body as Record<string, unknown>;
  if (typeof record.webhookKey !== 'string') return null;
  if (typeof record.transactionCode !== 'string') return null;
  if (typeof record.paymentSum !== 'number') return null;
  if (typeof record.payerEmail !== 'string') return null;
  return {
    webhookKey: record.webhookKey,
    transactionCode: record.transactionCode,
    paymentSum: record.paymentSum,
    payerFullName: typeof record.payerFullName === 'string' ? record.payerFullName : undefined,
    payerEmail: record.payerEmail,
    payerPhone: typeof record.payerPhone === 'string' ? record.payerPhone : undefined,
    productData: Array.isArray(record.productData) ? (record.productData as TicketItem[]) : undefined,
  };
}

export async function handleGrowWebhook(rawBody: unknown): Promise<WebhookResult> {
  const payload = parsePayload(rawBody);
  if (!payload) {
    return { status: 400, body: { error: 'invalid_payload' } };
  }
  if (!verifyWebhookKey(payload)) {
    return { status: 401, body: { error: 'invalid_webhook_key' } };
  }

  const existing = await findTicketByTransactionCode(payload.transactionCode);
  if (existing) {
    return { status: 200, body: { ticketId: existing.ticketId, created: false } };
  }

  const ticket = await createTicket({
    transactionCode: payload.transactionCode,
    customerName: payload.payerFullName || 'Customer',
    customerEmail: payload.payerEmail || '',
    customerPhone: payload.payerPhone || null,
    items: payload.productData || [],
    paymentSum: payload.paymentSum,
  });

  const qrDataUri = await generateQrDataUri(ticket.ticketId);
  const sent = await sendTicketEmail(ticket, qrDataUri);
  await updateEmailStatus(ticket.ticketId, sent ? 'sent' : 'failed');

  return { status: 200, body: { ticketId: ticket.ticketId, created: true } };
}

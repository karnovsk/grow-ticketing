import { validateTicket, getTicketById, updateEmailStatus } from './ticketService';
import { sendTicketEmail } from './email';
import { generateQrDataUri } from './qr';

export interface CallableAuth {
  uid: string;
}

export type ValidateTicketData = { ticketId: string; note?: string };
export type ResendEmailData = { ticketId: string };

export async function handleValidateTicket(data: ValidateTicketData, auth: CallableAuth | undefined) {
  if (!auth) {
    throw new Error('unauthenticated');
  }
  // validateTicket's ValidateResult already models "not found" as a normal
  // return value (not an error) alongside "already validated" and success —
  // return it as-is so callers can branch on `ok`/`reason` without needing
  // to catch a thrown error for an expected, everyday outcome.
  return validateTicket(data.ticketId, auth.uid, data.note ?? null);
}

export async function handleResendTicketEmail(data: ResendEmailData, auth: CallableAuth | undefined) {
  if (!auth) {
    throw new Error('unauthenticated');
  }
  const ticket = await getTicketById(data.ticketId);
  if (!ticket) {
    throw new Error('ticket_not_found');
  }
  const qrDataUri = await generateQrDataUri(ticket.ticketId);
  const sent = await sendTicketEmail(ticket, qrDataUri);
  await updateEmailStatus(ticket.ticketId, sent ? 'sent' : 'failed');
  return { sent };
}

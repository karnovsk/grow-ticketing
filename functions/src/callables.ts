import { validateTicket, invalidateTicket, getTicketById, updateEmailStatus, updateCustomerEmail } from './ticketService';
import { sendTicketEmail } from './email';
import { generateQrDataUri } from './qr';

export interface CallableAuth {
  uid: string;
  email: string | null;
}

export type ValidateTicketData = { ticketId: string; note?: string };
export type InvalidateTicketData = { ticketId: string };
// `email` lets staff send to a corrected address (e.g. the buyer mistyped it
// at checkout); omitted, the ticket's stored customerEmail is used.
export type ResendEmailData = { ticketId: string; email?: string };

// Deliberately loose — this only guards against obvious typos/garbage from
// the staff form; the email provider is the real arbiter of deliverability.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function handleValidateTicket(data: ValidateTicketData, auth: CallableAuth | undefined) {
  if (!auth) {
    throw new Error('unauthenticated');
  }
  // validateTicket's ValidateResult already models "not found" as a normal
  // return value (not an error) alongside "already validated" and success —
  // return it as-is so callers can branch on `ok`/`reason` without needing
  // to catch a thrown error for an expected, everyday outcome.
  return validateTicket(data.ticketId, auth.uid, auth.email, data.note ?? null);
}

export async function handleInvalidateTicket(data: InvalidateTicketData, auth: CallableAuth | undefined) {
  if (!auth) {
    throw new Error('unauthenticated');
  }
  return invalidateTicket(data.ticketId, auth.uid, auth.email);
}

export async function handleResendTicketEmail(data: ResendEmailData, auth: CallableAuth | undefined) {
  if (!auth) {
    throw new Error('unauthenticated');
  }
  const ticket = await getTicketById(data.ticketId);
  if (!ticket) {
    throw new Error('ticket_not_found');
  }
  const email = data.email?.trim() || ticket.customerEmail;
  if (!EMAIL_PATTERN.test(email)) {
    throw new Error('invalid_email');
  }
  const qrDataUri = await generateQrDataUri(ticket.ticketId);
  const sent = await sendTicketEmail({ ...ticket, customerEmail: email }, qrDataUri);
  await updateEmailStatus(ticket.ticketId, sent ? 'sent' : 'failed');
  // Only persist a changed address once it's actually been delivered to, so a
  // failed attempt at a typo'd correction doesn't overwrite the original.
  if (sent && email !== ticket.customerEmail) {
    await updateCustomerEmail(ticket.ticketId, email);
  }
  return { sent, email: sent ? email : ticket.customerEmail };
}

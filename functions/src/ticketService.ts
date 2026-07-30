import * as admin from 'firebase-admin';
import { randomUUID } from 'crypto';
import { db } from './admin';
import { Ticket, TicketItem } from './types';

const COLLECTION = 'tickets';
// Idempotency lock keyed by Grow's transactionCode: lets createTicketIfNew
// check-and-create atomically inside one transaction, so two webhook calls
// for the same purchase arriving concurrently can't both create a ticket
// (a plain query-then-create, which was here before, could not guarantee that).
const TRANSACTION_LOCKS_COLLECTION = 'transactionLocks';

export interface NewTicketInput {
  transactionCode: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
  items: TicketItem[];
  paymentSum: number;
}

function buildNewTicket(ticketId: string, input: NewTicketInput): Ticket {
  return {
    ticketId,
    status: 'issued',
    transactionCode: input.transactionCode,
    customerName: input.customerName,
    customerEmail: input.customerEmail,
    customerPhone: input.customerPhone,
    items: input.items,
    paymentSum: input.paymentSum,
    issuedAt: admin.firestore.Timestamp.now(),
    validatedAt: null,
    validatedBy: null,
    validatedByEmail: null,
    validationNote: null,
    emailStatus: 'failed',
  };
}

export interface CreateTicketIfNewResult {
  ticket: Ticket;
  created: boolean;
}

export async function createTicketIfNew(input: NewTicketInput): Promise<CreateTicketIfNewResult> {
  const lockRef = db.collection(TRANSACTION_LOCKS_COLLECTION).doc(input.transactionCode);
  const ticketId = randomUUID();
  return db.runTransaction(async (tx): Promise<CreateTicketIfNewResult> => {
    const lockDoc = await tx.get(lockRef);
    if (lockDoc.exists) {
      const existingTicketId = (lockDoc.data() as { ticketId: string }).ticketId;
      const existingTicketDoc = await tx.get(db.collection(COLLECTION).doc(existingTicketId));
      return { ticket: existingTicketDoc.data() as Ticket, created: false };
    }
    const ticket = buildNewTicket(ticketId, input);
    tx.set(db.collection(COLLECTION).doc(ticketId), ticket);
    tx.set(lockRef, { ticketId });
    return { ticket, created: true };
  });
}

export async function getTicketById(ticketId: string): Promise<Ticket | null> {
  const doc = await db.collection(COLLECTION).doc(ticketId).get();
  return doc.exists ? (doc.data() as Ticket) : null;
}

export async function updateEmailStatus(ticketId: string, status: 'sent' | 'failed'): Promise<void> {
  await db.collection(COLLECTION).doc(ticketId).update({ emailStatus: status });
}

export type ValidateResult =
  | { ok: true; ticket: Ticket }
  | { ok: false; reason: 'not_found' }
  | { ok: false; reason: 'already_validated'; ticket: Ticket };

export async function validateTicket(
  ticketId: string,
  validatedBy: string,
  validatedByEmail: string | null,
  note: string | null = null,
): Promise<ValidateResult> {
  const ref = db.collection(COLLECTION).doc(ticketId);
  return db.runTransaction(async (tx): Promise<ValidateResult> => {
    const doc = await tx.get(ref);
    if (!doc.exists) return { ok: false, reason: 'not_found' };
    const ticket = doc.data() as Ticket;
    if (ticket.status === 'validated') return { ok: false, reason: 'already_validated', ticket };
    const validatedAt = admin.firestore.Timestamp.now();
    tx.update(ref, { status: 'validated', validatedAt, validatedBy, validatedByEmail, validationNote: note });
    return {
      ok: true,
      ticket: { ...ticket, status: 'validated', validatedAt, validatedBy, validatedByEmail, validationNote: note },
    };
  });
}

import { Timestamp } from 'firebase-admin/firestore';
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
    issuedAt: Timestamp.now(),
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

// validationNote is an append-only log, not a single overwritable field — a
// ticket can cycle issued -> validated -> invalidated -> validated again, and
// each step's note (staff-typed or system-generated) should stack onto the
// previous history rather than erase it.
function appendNote(existing: string | null, addition: string | null): string | null {
  if (!addition) return existing;
  return existing ? `${existing}\n${addition}` : addition;
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
    const validatedAt = Timestamp.now();
    const validationNote = appendNote(ticket.validationNote, note);
    tx.update(ref, { status: 'validated', validatedAt, validatedBy, validatedByEmail, validationNote });
    return {
      ok: true,
      ticket: { ...ticket, status: 'validated', validatedAt, validatedBy, validatedByEmail, validationNote },
    };
  });
}

export type InvalidateResult =
  | { ok: true; ticket: Ticket }
  | { ok: false; reason: 'not_found' }
  | { ok: false; reason: 'not_validated'; ticket: Ticket };

export async function invalidateTicket(
  ticketId: string,
  invalidatedBy: string,
  invalidatedByEmail: string | null,
): Promise<InvalidateResult> {
  const ref = db.collection(COLLECTION).doc(ticketId);
  return db.runTransaction(async (tx): Promise<InvalidateResult> => {
    const doc = await tx.get(ref);
    if (!doc.exists) return { ok: false, reason: 'not_found' };
    const ticket = doc.data() as Ticket;
    if (ticket.status !== 'validated') return { ok: false, reason: 'not_validated', ticket };
    const note = `Invalidated ${new Date().toISOString()} by ${invalidatedByEmail ?? invalidatedBy}`;
    const validationNote = appendNote(ticket.validationNote, note);
    tx.update(ref, {
      status: 'issued',
      validatedAt: null,
      validatedBy: null,
      validatedByEmail: null,
      validationNote,
    });
    return {
      ok: true,
      ticket: {
        ...ticket,
        status: 'issued',
        validatedAt: null,
        validatedBy: null,
        validatedByEmail: null,
        validationNote,
      },
    };
  });
}

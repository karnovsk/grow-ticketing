import * as admin from 'firebase-admin';
import { randomUUID } from 'crypto';
import { db } from './admin';
import { Ticket, TicketItem } from './types';

const COLLECTION = 'tickets';

export interface NewTicketInput {
  transactionCode: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
  items: TicketItem[];
  paymentSum: number;
}

export async function findTicketByTransactionCode(transactionCode: string): Promise<Ticket | null> {
  const snap = await db.collection(COLLECTION).where('transactionCode', '==', transactionCode).limit(1).get();
  if (snap.empty) return null;
  return snap.docs[0].data() as Ticket;
}

export async function createTicket(input: NewTicketInput): Promise<Ticket> {
  const ticketId = randomUUID();
  const ticket: Ticket = {
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
    validationNote: null,
    emailStatus: 'failed',
  };
  await db.collection(COLLECTION).doc(ticketId).set(ticket);
  return ticket;
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
  note: string | null = null,
): Promise<ValidateResult> {
  const ref = db.collection(COLLECTION).doc(ticketId);
  const doc = await ref.get();
  if (!doc.exists) return { ok: false, reason: 'not_found' };
  const ticket = doc.data() as Ticket;
  if (ticket.status === 'validated') return { ok: false, reason: 'already_validated', ticket };
  const validatedAt = admin.firestore.Timestamp.now();
  await ref.update({ status: 'validated', validatedAt, validatedBy, validationNote: note });
  return { ok: true, ticket: { ...ticket, status: 'validated', validatedAt, validatedBy, validationNote: note } };
}

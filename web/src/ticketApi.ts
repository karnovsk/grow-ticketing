import { httpsCallable } from 'firebase/functions';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { functions, db } from './firebaseClient';

export interface TicketRecord {
  ticketId: string;
  status: 'issued' | 'validated';
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
  transactionCode: string;
  items: { name: string; quantity: number }[];
  paymentSum: number;
  issuedAt: { seconds: number };
  validatedAt: { seconds: number } | null;
  validatedBy: string | null;
  validatedByEmail: string | null;
  validationNote: string | null;
  emailStatus: 'sent' | 'failed';
}

export async function validateTicket(ticketId: string, note?: string) {
  const callable = httpsCallable(functions, 'validateTicketCallable');
  const result = await callable({ ticketId, note });
  return result.data;
}

export async function invalidateTicket(ticketId: string) {
  const callable = httpsCallable(functions, 'invalidateTicketCallable');
  const result = await callable({ ticketId });
  return result.data;
}

export async function resendTicketEmail(ticketId: string) {
  const callable = httpsCallable(functions, 'resendTicketEmailCallable');
  const result = await callable({ ticketId });
  return result.data;
}

export async function searchTicketsByField(field: 'transactionCode', value: string): Promise<TicketRecord[]> {
  const q = query(collection(db, 'tickets'), where(field, '==', value));
  const snap = await getDocs(q);
  return snap.docs.map((doc) => doc.data() as TicketRecord);
}

export async function getTicketById(ticketId: string): Promise<TicketRecord | null> {
  const snap = await getDoc(doc(db, 'tickets', ticketId));
  return snap.exists() ? (snap.data() as TicketRecord) : null;
}

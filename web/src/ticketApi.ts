import { httpsCallable } from 'firebase/functions';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { functions, db } from './firebaseClient';

export interface TicketRecord {
  ticketId: string;
  status: 'issued' | 'validated';
  customerName: string;
  customerPhone: string | null;
  transactionCode: string;
  items: { name: string; quantity: number }[];
  validatedAt: { seconds: number } | null;
  validatedBy: string | null;
}

export async function validateTicket(ticketId: string, note?: string) {
  const callable = httpsCallable(functions, 'validateTicketCallable');
  const result = await callable({ ticketId, note });
  return result.data;
}

export async function resendTicketEmail(ticketId: string) {
  const callable = httpsCallable(functions, 'resendTicketEmailCallable');
  const result = await callable({ ticketId });
  return result.data;
}

export async function searchTicketsByField(
  field: 'customerName' | 'customerPhone' | 'transactionCode',
  value: string,
): Promise<TicketRecord[]> {
  const q = query(collection(db, 'tickets'), where(field, '==', value));
  const snap = await getDocs(q);
  return snap.docs.map((doc) => doc.data() as TicketRecord);
}

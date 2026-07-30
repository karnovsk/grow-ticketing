export interface TicketItem {
  name: string;
  quantity: number;
}

export interface Ticket {
  ticketId: string;
  status: 'issued' | 'validated';
  transactionCode: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
  items: TicketItem[];
  paymentSum: number;
  issuedAt: FirebaseFirestore.Timestamp;
  validatedAt: FirebaseFirestore.Timestamp | null;
  validatedBy: string | null;
  validatedByEmail: string | null;
  validationNote: string | null;
  emailStatus: 'sent' | 'failed';
}

export interface GrowWebhookPayload {
  webhookKey: string;
  transactionCode: string;
  paymentSum: number;
  payerFullName?: string;
  payerEmail?: string;
  payerPhone?: string;
  productData?: TicketItem[];
}
